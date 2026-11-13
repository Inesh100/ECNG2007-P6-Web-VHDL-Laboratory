/**
 * Fixture / test-double implementation of the shared workspace seam (P6B-FR-19).
 *
 * Used while P6A is unavailable. It is NOT an editor: it simply holds a
 * snapshot and lets a tester publish new revisions, the way P6A would after
 * each edit. The P6B UI exposes it as a plain text area clearly labelled as a
 * test double.
 */
import { referenceFiles, REFERENCE_TOP } from '../simulator/referenceFiles';
import type { WorkspaceFile, WorkspaceSnapshot, WorkspaceSource } from './types';

function newSessionId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `sess-${rnd}`;
}

export class FixtureWorkspace implements WorkspaceSource {
  readonly label = 'Fixture workspace (P6A test double)';
  readonly isTestDouble = true;
  private snapshot: WorkspaceSnapshot;
  private listeners = new Set<(s: WorkspaceSnapshot) => void>();

  constructor(files: WorkspaceFile[] = referenceFiles(), top = REFERENCE_TOP, sessionId = newSessionId()) {
    this.snapshot = {
      sessionId,
      revision: 1,
      top,
      files: files.map((f) => ({ ...f })),
      updatedAt: new Date().toISOString(),
    };
  }

  getSnapshot(): WorkspaceSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: WorkspaceSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Simulates the owner (P6A) publishing an edit to one file. */
  updateFile(path: string, content: string): void {
    const files = this.snapshot.files.map((f) => (f.path === path ? { ...f, content } : f));
    this.publish({ files });
  }

  /** Loads a published fixture case (files and top-level) as a new revision. */
  load(files: WorkspaceFile[], top: string): void {
    this.publish({ files: files.map((f) => ({ ...f })), top });
  }

  /** Restores the unmodified reference files. */
  reset(): void {
    this.publish({ files: referenceFiles(), top: REFERENCE_TOP });
  }

  private publish(change: Partial<Pick<WorkspaceSnapshot, 'files' | 'top'>>): void {
    this.snapshot = {
      ...this.snapshot,
      ...change,
      revision: this.snapshot.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    for (const l of this.listeners) l(this.snapshot);
  }
}
