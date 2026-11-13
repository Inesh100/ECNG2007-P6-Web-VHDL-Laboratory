// UT-WS: the A-B workspace seam implementations owned by P6B (reader side only).
import { afterEach, describe, expect, it } from 'vitest';
import { FixtureWorkspace } from '../../src/workspace/fixtureWorkspace';
import { hasSharedWorkspace, SharedWorkspace } from '../../src/workspace/sharedWorkspace';
import { isWorkspaceSnapshot, WORKSPACE_GLOBAL, type WorkspaceSnapshot } from '../../src/workspace/types';

describe('UT-WS-01 FixtureWorkspace (P6B-FR-19 test double)', () => {
  it('publishes a new revision on every change and notifies subscribers', () => {
    const ws = new FixtureWorkspace();
    const seen: number[] = [];
    const off = ws.subscribe((s) => seen.push(s.revision));
    ws.updateFile('src/counter.vhd', 'x');
    ws.reset();
    off();
    ws.updateFile('src/counter.vhd', 'y');
    expect(seen).toEqual([2, 3]);
    expect(ws.getSnapshot().revision).toBe(4);
  });
  it('produces snapshots that satisfy the seam shape', () => {
    expect(isWorkspaceSnapshot(new FixtureWorkspace().getSnapshot())).toBe(true);
    expect(isWorkspaceSnapshot({ sessionId: 's', revision: 1, top: 't', files: [{ path: 'a', role: 'other', content: '' }] })).toBe(false);
  });
});

describe('UT-WS-02 SharedWorkspace reads the P6A global', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[WORKSPACE_GLOBAL];
  });

  it('takes the owner snapshot and follows updates; ignores stale revisions', () => {
    let listener: ((s: WorkspaceSnapshot) => void) | undefined;
    const snap = (revision: number, content: string): WorkspaceSnapshot => ({ sessionId: 'p6a', revision, top: 'tb_counter', files: [{ path: 'src/counter.vhd', role: 'design', content }], updatedAt: '' });
    (window as unknown as Record<string, unknown>)[WORKSPACE_GLOBAL] = { getSnapshot: () => snap(5, 'v5'), subscribe: (fn: typeof listener) => ((listener = fn), () => undefined) };
    expect(hasSharedWorkspace()).toBe(true);
    const ws = new SharedWorkspace(new FixtureWorkspace().getSnapshot());
    expect(ws.getSnapshot().revision).toBe(5);
    listener!(snap(6, 'v6'));
    expect(ws.getSnapshot().files[0].content).toBe('v6');
    listener!(snap(4, 'old'));
    expect(ws.getSnapshot().revision).toBe(6);
    ws.dispose();
  });

  it('falls back to the fixture when no P6A seam is present', () => {
    expect(hasSharedWorkspace()).toBe(false);
  });
});
