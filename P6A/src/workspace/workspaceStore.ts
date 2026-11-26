/**
 * P6A workspace owner and publisher, DE-A-06 (P6A-FR-6, P6A-IR-1, P6-StR4.1).
 *
 * Holds the source/editor state for the fixed file model and publishes a new
 * immutable WorkspaceSnapshot after every edit, through both IF-P6-WS-01
 * channels:
 *
 *   1. Same page:   window.__P6_WORKSPACE__ = { getSnapshot(), subscribe(fn) }
 *   2. Other frame: BroadcastChannel('p6-workspace-v1')
 *                   posts { type: 'snapshot', snapshot } after each change and
 *                   answers { type: 'request-snapshot' }.
 *
 * Rules kept here (IF-P6-WS-01 section 3):
 *   R1  Only P6A writes. Nothing in this class accepts state from a reader.
 *   R3  revision only goes up within a sessionId: +1 for each content change.
 *       Switching tabs or receiving new diagnostic counts does not change it.
 */
import {
  WORKSPACE_CHANNEL,
  WORKSPACE_GLOBAL,
  type PublishedWorkspace,
  type WorkspaceChannelMessage,
  type WorkspaceDiagnosticSummary,
  type WorkspaceFile,
  type WorkspaceSnapshot,
} from './types';

/** The parts of BroadcastChannel this class uses (lets tests pass a fake). */
export interface ChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((ev: MessageEvent) => void) | null;
}

export interface WorkspaceStoreOptions {
  files: WorkspaceFile[];
  top: string;
  sessionId?: string;
  /** Clock, for tests. */
  now?: () => Date;
}

export function newSessionId(): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `p6a-${rnd}`;
}

function copyFiles(files: WorkspaceFile[]): WorkspaceFile[] {
  return files.map((f) => ({ path: f.path, role: f.role, content: f.content }));
}

export class WorkspaceStore implements PublishedWorkspace {
  private snapshot: WorkspaceSnapshot;
  private readonly listeners = new Set<(s: WorkspaceSnapshot) => void>();
  private readonly now: () => Date;
  private channel?: ChannelLike;

  constructor(options: WorkspaceStoreOptions) {
    this.now = options.now ?? (() => new Date());
    this.snapshot = Object.freeze({
      sessionId: options.sessionId ?? newSessionId(),
      revision: 1,
      top: options.top,
      files: copyFiles(options.files),
      diagnostics: { errors: 0, warnings: 0 },
      updatedAt: this.now().toISOString(),
    });
  }

  // ------------------------------------------------------------------ reading

  getSnapshot = (): WorkspaceSnapshot => this.snapshot;

  subscribe = (listener: (s: WorkspaceSnapshot) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getFile(path: string): WorkspaceFile | undefined {
    return this.snapshot.files.find((f) => f.path === path);
  }

  // ------------------------------------------------------------------ writing (P6A only)

  /** One editor edit to one file. Returns true if the revision went up. */
  updateFile(path: string, content: string): boolean {
    const current = this.getFile(path);
    if (!current) throw new Error(`"${path}" is not part of the prescribed file model`);
    if (current.content === content) return false;
    this.commit({
      files: this.snapshot.files.map((f) => (f.path === path ? { ...f, content } : { ...f })),
    });
    return true;
  }

  /**
   * Replaces the content of several files as ONE edit (loading a published
   * scenario, or resetting to the reference files). The file set itself is
   * fixed: unknown paths are rejected and missing ones keep their content.
   */
  replaceContents(contents: Record<string, string>): boolean {
    for (const path of Object.keys(contents)) {
      if (!this.getFile(path)) throw new Error(`"${path}" is not part of the prescribed file model`);
    }
    const changed = this.snapshot.files.some((f) => contents[f.path] !== undefined && contents[f.path] !== f.content);
    if (!changed) return false;
    this.commit({
      files: this.snapshot.files.map((f) => ({ ...f, content: contents[f.path] ?? f.content })),
    });
    return true;
  }

  /**
   * Diagnostic counts from the language service. Display-only for P6B, so they
   * are republished with the SAME revision (they describe that revision).
   */
  setDiagnostics(summary: WorkspaceDiagnosticSummary): void {
    const d = this.snapshot.diagnostics;
    if (d && d.errors === summary.errors && d.warnings === summary.warnings) return;
    this.snapshot = Object.freeze({ ...this.snapshot, diagnostics: { ...summary } });
    this.emit();
  }

  private commit(change: Pick<WorkspaceSnapshot, 'files'>): void {
    this.snapshot = Object.freeze({
      ...this.snapshot,
      ...change,
      revision: this.snapshot.revision + 1,
      updatedAt: this.now().toISOString(),
    });
    this.emit();
  }

  private emit(): void {
    const s = this.snapshot;
    for (const l of [...this.listeners]) {
      try {
        l(s);
      } catch (err) {
        // A faulty reader must never break the editor or other readers.
        console.error('[P6A workspace] subscriber failed', err);
      }
    }
    this.post({ type: 'snapshot', snapshot: s });
  }

  // ------------------------------------------------------------------ publication

  /**
   * Publishes this store on IF-P6-WS-01. Call once at start-up, before P6B
   * loads. Returns a function that withdraws both channels.
   *
   * @param win     the window to expose `__P6_WORKSPACE__` on
   * @param channel a BroadcastChannel (or fake); defaults to a real one when available
   */
  expose(win: object = globalThis, channel: ChannelLike | undefined = createChannel()): () => void {
    const published: PublishedWorkspace = { getSnapshot: this.getSnapshot, subscribe: this.subscribe };
    (win as Record<string, unknown>)[WORKSPACE_GLOBAL] = published;

    this.channel = channel;
    if (channel) {
      channel.onmessage = (ev: MessageEvent) => {
        const data = ev.data as Partial<WorkspaceChannelMessage> | undefined;
        if (data?.type === 'request-snapshot') this.post({ type: 'snapshot', snapshot: this.snapshot });
      };
      // Announce the current state for readers that are already listening.
      this.post({ type: 'snapshot', snapshot: this.snapshot });
    }

    return () => {
      const w = win as Record<string, unknown>;
      if (w[WORKSPACE_GLOBAL] === published) delete w[WORKSPACE_GLOBAL];
      if (this.channel) {
        this.channel.onmessage = null;
        this.channel.close();
        this.channel = undefined;
      }
    };
  }

  private post(message: WorkspaceChannelMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch (err) {
      console.error('[P6A workspace] could not post on BroadcastChannel', err);
    }
  }
}

function createChannel(): ChannelLike | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  return new BroadcastChannel(WORKSPACE_CHANNEL) as unknown as ChannelLike;
}
