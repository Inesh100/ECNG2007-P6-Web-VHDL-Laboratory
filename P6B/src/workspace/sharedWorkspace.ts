/**
 * Integration adapter for the real P6A editor (P6B-FR-03, P6B-FR-18).
 *
 * P6A publishes snapshots in either (or both) of two ways, agreed at the A-B
 * interface baseline:
 *   1. window.__P6_WORKSPACE__ = { getSnapshot(), subscribe(fn) }  (same page)
 *   2. BroadcastChannel('p6-workspace-v1') messages
 *        { type: 'snapshot', snapshot }            (separate tab / frame)
 *      plus answering { type: 'request-snapshot' } with a snapshot.
 *
 * This adapter reads whichever is present. It never writes source state.
 */
import {
  isWorkspaceSnapshot,
  WORKSPACE_CHANNEL,
  WORKSPACE_GLOBAL,
  type WorkspaceSnapshot,
  type WorkspaceSource,
} from './types';

type GlobalWorkspace = Pick<WorkspaceSource, 'getSnapshot' | 'subscribe'>;

export function findGlobalWorkspace(win: Window = window): GlobalWorkspace | undefined {
  const g = (win as unknown as Record<string, unknown>)[WORKSPACE_GLOBAL] as GlobalWorkspace | undefined;
  if (g && typeof g.getSnapshot === 'function' && typeof g.subscribe === 'function') return g;
  return undefined;
}

export class SharedWorkspace implements WorkspaceSource {
  readonly label = 'P6A editor (shared workspace)';
  readonly isTestDouble = false;
  private snapshot: WorkspaceSnapshot;
  private listeners = new Set<(s: WorkspaceSnapshot) => void>();
  private channel?: BroadcastChannel;
  private unsubscribeGlobal?: () => void;

  constructor(initial: WorkspaceSnapshot, win: Window = window) {
    this.snapshot = initial;
    const g = findGlobalWorkspace(win);
    if (g) {
      this.snapshot = g.getSnapshot();
      this.unsubscribeGlobal = g.subscribe((s) => this.accept(s));
    }
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(WORKSPACE_CHANNEL);
      this.channel.onmessage = (ev: MessageEvent) => {
        const data = ev.data as { type?: string; snapshot?: unknown };
        if (data?.type === 'snapshot' && isWorkspaceSnapshot(data.snapshot)) this.accept(data.snapshot);
      };
      this.channel.postMessage({ type: 'request-snapshot' });
    }
  }

  getSnapshot(): WorkspaceSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: WorkspaceSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribeGlobal?.();
    this.channel?.close();
  }

  private accept(s: WorkspaceSnapshot): void {
    // Ignore stale revisions from the same session.
    if (s.sessionId === this.snapshot.sessionId && s.revision < this.snapshot.revision) return;
    this.snapshot = s;
    for (const l of this.listeners) l(s);
  }
}

/**
 * Picks the workspace source at start-up: the real P6A seam if present
 * (or forced with ?workspace=shared), otherwise the fixture test double.
 */
export function hasSharedWorkspace(win: Window = window): boolean {
  const forced = new URLSearchParams(win.location.search).get('workspace');
  if (forced === 'fixture') return false;
  if (forced === 'shared') return true;
  return findGlobalWorkspace(win) !== undefined;
}
