/**
 * P6 shared browser workspace/session model, IF-P6-WS-01 (P6A-IR-1).
 *
 * P6A is the OWNER and the only WRITER of this state. P6B only reads it.
 * The flow is one-way, P6A -> P6B.
 *
 * This file mirrors the seam specification in P6B/docs/interface-p6a-p6b.md
 * field for field. P6A does not import P6B code: each side keeps its own copy
 * of the agreed shape so that the two components stay independently testable.
 * A change to any field here needs a joint change request.
 */

export type FileRole = 'design' | 'testbench';

export interface WorkspaceFile {
  /** Path in the prescribed file model, e.g. "src/counter.vhd". */
  path: string;
  role: FileRole;
  /** Full text, exactly as it is in the editor. */
  content: string;
}

export interface WorkspaceDiagnosticSummary {
  errors: number;
  warnings: number;
}

export interface WorkspaceSnapshot {
  /** Stable for the browser session (one page load of P6A). */
  sessionId: string;
  /** Incremented by P6A on every edit. Never goes down within a session. */
  revision: number;
  /** Top-level testbench entity, e.g. "tb_counter". */
  top: string;
  /** The prescribed, fixed file set. */
  files: WorkspaceFile[];
  /** Editor diagnostic counts. P6B only displays them. */
  diagnostics?: WorkspaceDiagnosticSummary;
  /** ISO 8601 time of the last change. */
  updatedAt: string;
}

/** Same-page publication object, set on window[WORKSPACE_GLOBAL]. */
export interface PublishedWorkspace {
  getSnapshot(): WorkspaceSnapshot;
  subscribe(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
}

/** BroadcastChannel messages on WORKSPACE_CHANNEL. */
export type WorkspaceChannelMessage =
  | { type: 'snapshot'; snapshot: WorkspaceSnapshot }
  | { type: 'request-snapshot' };

export const WORKSPACE_CHANNEL = 'p6-workspace-v1';
export const WORKSPACE_GLOBAL = '__P6_WORKSPACE__';

/** Structural check used by tests and by the recording reader. */
export function isWorkspaceSnapshot(v: unknown): v is WorkspaceSnapshot {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.sessionId === 'string' &&
    typeof s.revision === 'number' &&
    typeof s.top === 'string' &&
    typeof s.updatedAt === 'string' &&
    Array.isArray(s.files) &&
    s.files.every(
      (f) =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as WorkspaceFile).path === 'string' &&
        typeof (f as WorkspaceFile).content === 'string' &&
        ((f as WorkspaceFile).role === 'design' || (f as WorkspaceFile).role === 'testbench'),
    )
  );
}
