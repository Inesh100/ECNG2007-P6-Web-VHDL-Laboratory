/**
 * P6 shared browser workspace/session model - the A-B seam (P6A-IR-1, P6B-IR-01).
 *
 * P6A (Editor & Language Features) OWNS and WRITES this state.
 * P6B (Run, Results & Waveforms) only READS it. Flow is one-directional A -> B.
 *
 * P6B never imports P6A code. It depends only on this interface, so P6A's real
 * implementation, the fixture test double, or the BroadcastChannel adapter can be
 * substituted without changing P6B behaviour (P6B-FR-19, P6B-SA-01).
 */
import type { FileRole } from '../contracts/hdlService';

export interface WorkspaceFile {
  path: string;
  role: FileRole;
  content: string;
}

export interface WorkspaceDiagnosticSummary {
  errors: number;
  warnings: number;
}

export interface WorkspaceSnapshot {
  /** Stable id for the browser session. */
  sessionId: string;
  /** Monotonic counter, incremented by the owner on every edit. */
  revision: number;
  /** Top-level testbench entity, per Course HDL Artefact Convention v1. */
  top: string;
  files: WorkspaceFile[];
  /** Optional editor diagnostic counts published by P6A. P6B only displays them. */
  diagnostics?: WorkspaceDiagnosticSummary;
  updatedAt: string;
}

/** Read-only view P6B consumes. */
export interface WorkspaceSource {
  /** Human label shown in the UI, e.g. "P6A editor" or "Fixture test double". */
  readonly label: string;
  /** True when this is a test double rather than the real P6A editor. */
  readonly isTestDouble: boolean;
  getSnapshot(): WorkspaceSnapshot;
  subscribe(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
}

/** Name of the BroadcastChannel and window global used for integration. */
export const WORKSPACE_CHANNEL = 'p6-workspace-v1';
export const WORKSPACE_GLOBAL = '__P6_WORKSPACE__';

export function isWorkspaceSnapshot(v: unknown): v is WorkspaceSnapshot {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.sessionId === 'string' &&
    typeof s.revision === 'number' &&
    typeof s.top === 'string' &&
    Array.isArray(s.files) &&
    s.files.every(
      (f) =>
        typeof f === 'object' && f !== null &&
        typeof (f as WorkspaceFile).path === 'string' &&
        typeof (f as WorkspaceFile).content === 'string' &&
        ((f as WorkspaceFile).role === 'design' || (f as WorkspaceFile).role === 'testbench'),
    )
  );
}
