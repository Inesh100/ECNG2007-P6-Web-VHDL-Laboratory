/**
 * P6A language-service simulator: Language Server Protocol wiring.
 *
 * Speaks real LSP (JSON-RPC) to monaco-languageclient. The same code runs:
 *   - in a browser Web Worker (default; src/languageService/worker.ts), and
 *   - in Node over WebSocket (simulator/server.ts), the transport a Project 5
 *     VHDL-LS gateway would use, so P6A can later point at P5 unchanged.
 *
 * The connection is typed by the small `LspConnection` interface below rather
 * than by vscode-languageserver's Connection, so this module has no runtime
 * dependency and can be unit-tested with a fake. vscode-languageserver's real
 * Connection satisfies the interface.
 *
 * Fault injection for IT-LSP-02 (P6A-FR-7):
 *   timeout  never answers `initialize`
 *   error    answers `initialize` with an error
 *   crash    starts normally, then the transport is closed after `crashAfterMs`
 * ('refuse' is a client-side fault: the transport never opens.)
 */
import { analyzeWorkspace, type Diagnostic, type Position, type SourceFile } from './analyzer';
import { complete, hover, type CompletionItem, type Hover } from './completion';
import { referenceFiles } from '../files/referenceFiles';

export type ServerFault = 'none' | 'timeout' | 'error' | 'crash';

interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}
interface DidOpenParams {
  textDocument: TextDocumentItem;
}
interface DidChangeParams {
  textDocument: { uri: string; version: number };
  contentChanges: Array<{ text: string; range?: unknown }>;
}
interface DidCloseParams {
  textDocument: { uri: string };
}
interface TextDocumentPositionParams {
  textDocument: { uri: string };
  position: Position;
}
interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

export interface InitializeResultLike {
  capabilities: Record<string, unknown>;
  serverInfo: { name: string; version: string };
}

/** The subset of vscode-languageserver's Connection that this server uses. */
export interface LspConnection {
  onInitialize(handler: (params: unknown) => InitializeResultLike | Promise<InitializeResultLike>): unknown;
  onInitialized(handler: () => void): unknown;
  onShutdown(handler: () => void): unknown;
  onDidOpenTextDocument(handler: (params: DidOpenParams) => void): unknown;
  onDidChangeTextDocument(handler: (params: DidChangeParams) => void): unknown;
  onDidCloseTextDocument(handler: (params: DidCloseParams) => void): unknown;
  onCompletion(handler: (params: TextDocumentPositionParams) => CompletionItem[] | null): unknown;
  onHover(handler: (params: TextDocumentPositionParams) => Hover | null): unknown;
  sendDiagnostics(params: PublishDiagnosticsParams): unknown;
}

export interface ServerOptions {
  fault?: ServerFault;
  /** Delay after the last change before diagnostics are published. */
  debounceMs?: number;
  crashAfterMs?: number;
  /** Called for the 'crash' fault; the host closes the transport. */
  onCrash?: () => void;
  /** Root of the editor's in-memory file system. */
  workspaceRoot?: string;
}

export const SERVER_NAME = 'P6A VHDL language-service simulator';
export const SERVER_VERSION = '1.0.0';
export const DEFAULT_DEBOUNCE_MS = 150;

/** "file:///workspace/src/counter.vhd" -> "src/counter.vhd" */
export function uriToPath(uri: string, root = '/workspace/'): string {
  let p = uri;
  try {
    p = decodeURIComponent(new URL(uri).pathname);
  } catch {
    // not a URL; use as is
  }
  const at = p.indexOf(root);
  if (at >= 0) return p.slice(at + root.length);
  return p.replace(/^\/+/, '');
}

export class VhdlLanguageServer {
  private readonly docs = new Map<string, { uri: string; version: number; text: string }>();
  private timer?: ReturnType<typeof setTimeout>;
  private readonly debounceMs: number;
  private readonly root: string;

  constructor(
    private readonly connection: LspConnection,
    private readonly options: ServerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.root = options.workspaceRoot ?? '/workspace/';
    const fault = options.fault ?? 'none';

    connection.onInitialize(() => {
      if (fault === 'timeout') return new Promise<InitializeResultLike>(() => undefined);
      if (fault === 'error') throw new Error('P6A language-service simulator: injected "error" fault');
      return {
        capabilities: {
          textDocumentSync: { openClose: true, change: 1 /* Full */ },
          completionProvider: { triggerCharacters: ['.'], resolveProvider: false },
          hoverProvider: true,
        },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    });

    connection.onInitialized(() => {
      if (fault === 'crash') setTimeout(() => options.onCrash?.(), options.crashAfterMs ?? 3000);
    });

    connection.onShutdown(() => {
      if (this.timer) clearTimeout(this.timer);
    });

    connection.onDidOpenTextDocument(({ textDocument }) => {
      this.docs.set(uriToPath(textDocument.uri, this.root), { uri: textDocument.uri, version: textDocument.version, text: textDocument.text });
      this.schedule();
    });

    connection.onDidChangeTextDocument(({ textDocument, contentChanges }) => {
      const path = uriToPath(textDocument.uri, this.root);
      const last = contentChanges[contentChanges.length - 1];
      if (!last) return;
      this.docs.set(path, { uri: textDocument.uri, version: textDocument.version, text: last.text });
      this.schedule();
    });

    connection.onDidCloseTextDocument(({ textDocument }) => {
      const path = uriToPath(textDocument.uri, this.root);
      this.docs.delete(path);
      connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
      this.schedule();
    });

    connection.onCompletion(({ textDocument, position }) => {
      const { ws, contents } = this.analyze();
      return complete(ws, contents, uriToPath(textDocument.uri, this.root), position);
    });

    connection.onHover(({ textDocument, position }) => {
      const { ws, contents } = this.analyze();
      return hover(ws, contents, uriToPath(textDocument.uri, this.root), position);
    });
  }

  /**
   * Open documents, plus the reference files for any path the editor has not
   * opened, so cross-file names (entity work.counter) always resolve.
   */
  private workspaceFiles(): SourceFile[] {
    const files: SourceFile[] = [...this.docs.entries()].map(([path, d]) => ({ path, content: d.text }));
    for (const ref of referenceFiles()) if (!this.docs.has(ref.path)) files.push({ path: ref.path, content: ref.content });
    return files;
  }

  private analyze() {
    const files = this.workspaceFiles();
    return { ws: analyzeWorkspace(files), contents: new Map(files.map((f) => [f.path, f.content])) };
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.publishNow(), this.debounceMs);
  }

  /** Validates every open document and publishes its diagnostics. */
  publishNow(): void {
    this.timer = undefined;
    const { ws } = this.analyze();
    for (const [path, doc] of this.docs) {
      const diagnostics = ws.files.get(path)?.diagnostics ?? [];
      this.connection.sendDiagnostics({ uri: doc.uri, version: doc.version, diagnostics });
    }
  }
}

/** Creates the server on a connection. The caller then calls connection.listen(). */
export function startVhdlLanguageServer(connection: LspConnection, options: ServerOptions = {}): VhdlLanguageServer {
  return new VhdlLanguageServer(connection, options);
}
