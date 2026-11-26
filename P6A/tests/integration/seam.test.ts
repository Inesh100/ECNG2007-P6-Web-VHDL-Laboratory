/**
 * IF-P6-WS-01 seam, P6A side (IT-SEAM-02), and P6A writer against the REAL
 * P6B reader adapter (code level of IT-SEAM-03).
 *
 * The P6B adapter is imported read-only from ../../../P6B: P6A does not change
 * or ship any P6B code; the test only proves the two sides agree.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceStore } from '../../src/workspace/workspaceStore';
import { WORKSPACE_CHANNEL, isWorkspaceSnapshot, type WorkspaceSnapshot } from '../../src/workspace/types';
import { COUNTER_PATH, REFERENCE_TOP, referenceFiles } from '../../src/files/referenceFiles';
import { SharedWorkspace, hasSharedWorkspace } from '../../../P6B/src/workspace/sharedWorkspace';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/**
 * BroadcastChannel delivery is asynchronous and its timing differs by OS
 * (Windows timers tick about every 15 ms), so wait for the condition instead
 * of a fixed delay. Gives up after `timeoutMs`; the assertion that follows
 * then reports the real difference.
 */
async function until(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!cond() && Date.now() < end) await tick(10);
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function exposedStore(win: object = {}) {
  const store = new WorkspaceStore({ files: referenceFiles(), top: REFERENCE_TOP, sessionId: 'p6a-seam' });
  cleanups.push(store.expose(win));
  return store;
}

describe('IT-SEAM-02 P6A writes IF-P6-WS-01 (recording reader on BroadcastChannel)', () => {
  it('publishes a valid snapshot per edit, none on tab switch, and answers request-snapshot', async () => {
    const store = exposedStore();
    const reader = new BroadcastChannel(WORKSPACE_CHANNEL);
    cleanups.push(() => reader.close());
    const recorded: WorkspaceSnapshot[] = [];
    reader.onmessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'snapshot') recorded.push(ev.data.snapshot);
    };

    // 1. read the initial snapshot
    reader.postMessage({ type: 'request-snapshot' });
    await until(() => recorded.length >= 1);
    expect(recorded.map((s) => s.revision)).toEqual([1]);

    // 2. type one character, 3. undo
    const original = store.getFile(COUNTER_PATH)!.content;
    store.updateFile(COUNTER_PATH, original.replace('begin', 'begin '));
    store.updateFile(COUNTER_PATH, original);
    // 4. switching file tabs is view state only: nothing to publish
    await until(() => recorded.length >= 3);
    await tick(50); // nothing further may arrive
    expect(recorded.map((s) => s.revision)).toEqual([1, 2, 3]);

    // 5. request-snapshot is answered with the current state
    reader.postMessage({ type: 'request-snapshot' });
    await until(() => recorded.length >= 4);
    const last = recorded.at(-1)!;
    expect(last.revision).toBe(3);
    expect(last.files.find((f) => f.path === COUNTER_PATH)!.content).toBe(original);
    expect(recorded.every(isWorkspaceSnapshot)).toBe(true);
    expect(new Set(recorded.map((s) => s.sessionId))).toEqual(new Set(['p6a-seam']));
  });
});

describe('P6A writer + real P6B SharedWorkspace reader', () => {
  it('same page: P6B reads window.__P6_WORKSPACE__ and follows every revision', () => {
    const win: Record<string, unknown> = { location: { search: '' } };
    const store = exposedStore(win);
    expect(hasSharedWorkspace(win as unknown as Window)).toBe(true);

    const p6b = new SharedWorkspace(store.getSnapshot(), win as unknown as Window);
    cleanups.push(() => p6b.dispose());
    expect(p6b.isTestDouble).toBe(false);
    expect(p6b.label).toBe('P6A editor (shared workspace)');

    const seen: number[] = [];
    p6b.subscribe((s) => seen.push(s.revision));
    const edited = store.getFile(COUNTER_PATH)!.content.replace('count <= std_logic_vector(count_r);', 'count <= std_logic_vector(count_r)');
    store.updateFile(COUNTER_PATH, edited);
    store.setDiagnostics({ errors: 1, warnings: 0 });

    // R2: P6B gets exactly what P6A published, nothing restructured
    expect(p6b.getSnapshot()).toEqual(store.getSnapshot());
    expect(p6b.getSnapshot().files.find((f) => f.path === COUNTER_PATH)!.content).toBe(edited);
    expect(seen[0]).toBe(2);
    expect(p6b.getSnapshot().diagnostics).toEqual({ errors: 1, warnings: 0 });
  });

  it('separate frame: P6B (?workspace=shared) gets the state over BroadcastChannel only', async () => {
    const store = exposedStore({});
    const frameWin = { location: { search: '?workspace=shared' } };
    expect(hasSharedWorkspace(frameWin as unknown as Window)).toBe(true);

    const placeholder = { ...store.getSnapshot(), sessionId: 'p6b-fixture', revision: 1 };
    const p6b = new SharedWorkspace(placeholder, frameWin as unknown as Window);
    cleanups.push(() => p6b.dispose());
    await until(() => p6b.getSnapshot().sessionId === 'p6a-seam');
    expect(p6b.getSnapshot().sessionId).toBe('p6a-seam');

    store.updateFile(COUNTER_PATH, store.getFile(COUNTER_PATH)!.content + '\n');
    await until(() => p6b.getSnapshot().revision === 2);
    expect(p6b.getSnapshot().revision).toBe(2);
    expect(p6b.getSnapshot()).toEqual(store.getSnapshot());
  });
});
