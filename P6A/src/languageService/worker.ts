/**
 * Web Worker entry for the P6A language-service simulator (default transport).
 *
 * Protocol with the main thread:
 *   1. main -> worker  { type: 'p6a-ls-init', fault }     (exactly once, first)
 *   2. then plain LSP JSON-RPC messages both ways (vscode-languageserver/browser)
 *   3. worker -> main  { type: 'p6a-ls-crashed' }         ('crash' fault only)
 */
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from 'vscode-languageserver/browser';
import { startVhdlLanguageServer, type LspConnection, type ServerFault } from './server';

interface WorkerScope {
  addEventListener(type: 'message', listener: (ev: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (ev: MessageEvent) => void): void;
  postMessage(message: unknown): void;
  close(): void;
}

const scope = self as unknown as WorkerScope;

function onInit(ev: MessageEvent) {
  const data = ev.data as { type?: string; fault?: ServerFault } | undefined;
  if (data?.type !== 'p6a-ls-init') return;
  scope.removeEventListener('message', onInit);

  const reader = new BrowserMessageReader(self as unknown as Worker);
  const writer = new BrowserMessageWriter(self as unknown as Worker);
  const connection = createConnection(reader, writer);
  startVhdlLanguageServer(connection as unknown as LspConnection, {
    fault: data.fault ?? 'none',
    onCrash: () => {
      scope.postMessage({ type: 'p6a-ls-crashed' });
      scope.close();
    },
  });
  connection.listen();
}

scope.addEventListener('message', onInit);
