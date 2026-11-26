/**
 * UT-WSA-01..05: the P6A workspace owner/publisher (DE-A-06, P6A-FR-6).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceStore, type ChannelLike } from '../../src/workspace/workspaceStore';
import { WORKSPACE_GLOBAL, isWorkspaceSnapshot, type PublishedWorkspace, type WorkspaceSnapshot } from '../../src/workspace/types';
import { COUNTER_PATH, REFERENCE_TOP, TB_COUNTER_PATH, referenceFiles } from '../../src/files/referenceFiles';

class FakeChannel implements ChannelLike {
  sent: unknown[] = [];
  closed = false;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  postMessage(m: unknown) {
    this.sent.push(m);
  }
  close() {
    this.closed = true;
  }
  deliver(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const make = () => new WorkspaceStore({ files: referenceFiles(), top: REFERENCE_TOP, sessionId: 'p6a-test' });

describe('WorkspaceStore', () => {
  let undo: (() => void) | undefined;
  afterEach(() => undo?.());

  it('UT-WSA-01 starts at revision 1 with a valid IF-P6-WS-01 snapshot', () => {
    const s = make().getSnapshot();
    expect(isWorkspaceSnapshot(s)).toBe(true);
    expect(s).toMatchObject({ sessionId: 'p6a-test', revision: 1, top: 'tb_counter', diagnostics: { errors: 0, warnings: 0 } });
    expect(s.files.map((f) => f.path)).toEqual([COUNTER_PATH, TB_COUNTER_PATH]);
    expect(Object.isFrozen(s)).toBe(true);
  });

  it('UT-WSA-02 every content change is +1 revision; no-op edits are not', () => {
    const store = make();
    const seen: number[] = [];
    store.subscribe((s) => seen.push(s.revision));
    const original = store.getFile(COUNTER_PATH)!.content;
    expect(store.updateFile(COUNTER_PATH, original + '-- x')).toBe(true);
    expect(store.updateFile(COUNTER_PATH, original + '-- x')).toBe(false);
    expect(store.updateFile(COUNTER_PATH, original)).toBe(true); // undo is an edit too
    expect(seen).toEqual([2, 3]);
    expect(store.getSnapshot().files[1].content).toBe(referenceFiles()[1].content);
  });

  it('UT-WSA-03 diagnostics are republished with the same revision', () => {
    const store = make();
    const seen: WorkspaceSnapshot[] = [];
    store.subscribe((s) => seen.push(s));
    store.setDiagnostics({ errors: 1, warnings: 0 });
    store.setDiagnostics({ errors: 1, warnings: 0 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ revision: 1, diagnostics: { errors: 1, warnings: 0 } });
  });

  it('UT-WSA-04 the file model is fixed', () => {
    const store = make();
    expect(() => store.updateFile('src/other.vhd', 'x')).toThrow();
    expect(() => store.replaceContents({ 'src/other.vhd': 'x' })).toThrow();
    expect(store.replaceContents({ [COUNTER_PATH]: 'a', [TB_COUNTER_PATH]: 'b' })).toBe(true);
    expect(store.getSnapshot().revision).toBe(2); // one edit for several files
    expect(store.replaceContents({ [COUNTER_PATH]: 'a' })).toBe(false);
  });

  it('UT-WSA-05 expose() publishes on both channels and answers request-snapshot', () => {
    const store = make();
    const win: Record<string, unknown> = {};
    const ch = new FakeChannel();
    undo = store.expose(win, ch);

    const g = win[WORKSPACE_GLOBAL] as PublishedWorkspace;
    expect(g.getSnapshot().revision).toBe(1);
    const viaGlobal: number[] = [];
    g.subscribe((s) => viaGlobal.push(s.revision));

    expect(ch.sent).toEqual([{ type: 'snapshot', snapshot: store.getSnapshot() }]); // announced on expose
    store.updateFile(COUNTER_PATH, 'x');
    expect(viaGlobal).toEqual([2]);
    expect(ch.sent.at(-1)).toEqual({ type: 'snapshot', snapshot: store.getSnapshot() });

    ch.sent = [];
    ch.deliver({ type: 'request-snapshot' });
    ch.deliver({ type: 'snapshot', snapshot: { ...store.getSnapshot(), revision: 99 } }); // R1: readers cannot write
    expect(ch.sent).toEqual([{ type: 'snapshot', snapshot: store.getSnapshot() }]);
    expect(store.getSnapshot().revision).toBe(2);

    undo();
    undo = undefined;
    expect(win[WORKSPACE_GLOBAL]).toBeUndefined();
    expect(ch.closed).toBe(true);
  });

  it('a throwing subscriber does not stop other readers', () => {
    const store = make();
    const got: number[] = [];
    store.subscribe(() => {
      throw new Error('bad reader');
    });
    store.subscribe((s) => got.push(s.revision));
    const err = console.error;
    console.error = () => undefined;
    try {
      store.updateFile(COUNTER_PATH, 'y');
    } finally {
      console.error = err;
    }
    expect(got).toEqual([2]);
  });
});
