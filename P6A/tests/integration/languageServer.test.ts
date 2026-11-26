/**
 * Language-service simulator behind the LSP connection (IT-LSP-01 / IT-LSP-02,
 * server side; P6A-FR-5, P6A-FR-7, P6A-PR-1).
 *
 * A fake connection records the handlers the server registers and the
 * diagnostics it publishes, so the LSP behaviour is checked without a browser.
 */
import { describe, expect, it } from 'vitest';
import { startVhdlLanguageServer, uriToPath, type InitializeResultLike, type LspConnection } from '../../src/languageService/server';
import { SCENARIOS, applyScenario, scenarioCursor } from '../../src/languageService/scenarios';
import { COUNTER_PATH, TB_COUNTER_PATH, referenceFiles } from '../../src/files/referenceFiles';

type Handler = (...args: any[]) => any;

class FakeConnection implements LspConnection {
  handlers: Record<string, Handler> = {};
  published: Array<{ uri: string; version?: number; diagnostics: Array<{ message: string; range: { start: { line: number } } }> }> = [];
  onInitialize(h: Handler) { this.handlers.initialize = h; }
  onInitialized(h: Handler) { this.handlers.initialized = h; }
  onShutdown(h: Handler) { this.handlers.shutdown = h; }
  onDidOpenTextDocument(h: Handler) { this.handlers.didOpen = h; }
  onDidChangeTextDocument(h: Handler) { this.handlers.didChange = h; }
  onDidCloseTextDocument(h: Handler) { this.handlers.didClose = h; }
  onCompletion(h: Handler) { this.handlers.completion = h; }
  onHover(h: Handler) { this.handlers.hover = h; }
  sendDiagnostics(p: FakeConnection['published'][number]) { this.published.push(p); }
  latest(uri: string) {
    return [...this.published].reverse().find((p) => p.uri === uri);
  }
}

const uri = (path: string) => `file:///workspace/${path}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function openAll(conn: FakeConnection, contents: Record<string, string>) {
  for (const [path, text] of Object.entries(contents)) {
    conn.handlers.didOpen({ textDocument: { uri: uri(path), languageId: 'vhdl', version: 1, text } });
  }
}

describe('LSP server', () => {
  it('advertises full sync, completion on "." and hover', async () => {
    const conn = new FakeConnection();
    startVhdlLanguageServer(conn);
    const init = (await conn.handlers.initialize({})) as InitializeResultLike;
    expect(init.capabilities).toMatchObject({
      textDocumentSync: { openClose: true, change: 1 },
      completionProvider: { triggerCharacters: ['.'] },
      hoverProvider: true,
    });
    expect(init.serverInfo.name).toContain('P6A');
  });

  it('maps editor URIs to the prescribed paths', () => {
    expect(uriToPath('file:///workspace/src/counter.vhd')).toBe('src/counter.vhd');
    expect(uriToPath('file:///workspace/tb/tb_counter.vhd')).toBe('tb/tb_counter.vhd');
  });

  it('IT-LSP-01 publishes each approved scenario after a change, within the PR-1 budget', async () => {
    const conn = new FakeConnection();
    startVhdlLanguageServer(conn, { debounceMs: 10 });
    const ref = Object.fromEntries(referenceFiles().map((f) => [f.path, f.content]));
    openAll(conn, ref);
    await wait(30);
    expect(conn.latest(uri(COUNTER_PATH))!.diagnostics).toEqual([]);
    expect(conn.latest(uri(TB_COUNTER_PATH))!.diagnostics).toEqual([]);

    let version = 2;
    for (const s of SCENARIOS.filter((x) => x.kind === 'diagnostics')) {
      const contents = applyScenario(ref, s);
      const started = Date.now();
      for (const [path, text] of Object.entries(contents)) {
        conn.handlers.didChange({ textDocument: { uri: uri(path), version }, contentChanges: [{ text }] });
      }
      version++;
      await wait(30);
      expect(Date.now() - started).toBeLessThan(1000); // P6A-PR-1: < 1.0 s after the pause
      const got = Object.keys(contents).flatMap((path) =>
        conn.latest(uri(path))!.diagnostics.map((d) => `${path}:${d.range.start.line + 1}: ${d.message}`),
      );
      const want = (s.expectedDiagnostics ?? []).map((d) => `${d.path}:${d.line}: ${d.message}`);
      expect(got, s.id).toEqual(want);
    }
  });

  it('answers completion and hover requests for the approved positions', async () => {
    const conn = new FakeConnection();
    startVhdlLanguageServer(conn, { debounceMs: 10 });
    const ref = Object.fromEntries(referenceFiles().map((f) => [f.path, f.content]));
    for (const s of SCENARIOS.filter((x) => x.kind !== 'diagnostics')) {
      const contents = applyScenario(ref, s);
      openAll(conn, contents);
      const cur = scenarioCursor(contents, s)!;
      const params = { textDocument: { uri: uri(cur.path) }, position: { line: cur.line, character: cur.character } };
      if (s.kind === 'completion') {
        const labels = (conn.handlers.completion(params) as Array<{ label: string }>).map((i) => i.label);
        for (const l of s.expectedCompletions ?? []) expect(labels, s.id).toContain(l);
      } else {
        expect(conn.handlers.hover(params).contents.value).toContain(s.expectedHover);
      }
    }
  });

  it('uses the reference file for a file the editor has not opened', async () => {
    const conn = new FakeConnection();
    startVhdlLanguageServer(conn, { debounceMs: 5 });
    conn.handlers.didOpen({ textDocument: { uri: uri(TB_COUNTER_PATH), languageId: 'vhdl', version: 1, text: referenceFiles()[1].content } });
    await wait(20);
    expect(conn.latest(uri(TB_COUNTER_PATH))!.diagnostics).toEqual([]); // work.counter resolves
    expect(conn.latest(uri(COUNTER_PATH))).toBeUndefined(); // nothing published for unopened files
  });

  it('clears diagnostics when a document is closed', async () => {
    const conn = new FakeConnection();
    startVhdlLanguageServer(conn, { debounceMs: 5 });
    conn.handlers.didOpen({ textDocument: { uri: uri(COUNTER_PATH), languageId: 'vhdl', version: 1, text: 'entity x is' } });
    await wait(20);
    expect(conn.latest(uri(COUNTER_PATH))!.diagnostics.length).toBeGreaterThan(0);
    conn.handlers.didClose({ textDocument: { uri: uri(COUNTER_PATH) } });
    expect(conn.latest(uri(COUNTER_PATH))!.diagnostics).toEqual([]);
  });
});

describe('IT-LSP-02 injected faults (server side)', () => {
  it('timeout: initialize never resolves', async () => {
    const conn = new FakeConnection();
    startVhdlLanguageServer(conn, { fault: 'timeout' });
    const r = await Promise.race([Promise.resolve(conn.handlers.initialize({})).then(() => 'answered'), wait(50).then(() => 'timeout')]);
    expect(r).toBe('timeout');
  });

  it('error: initialize fails', () => {
    const conn = new FakeConnection();
    startVhdlLanguageServer(conn, { fault: 'error' });
    expect(() => conn.handlers.initialize({})).toThrow(/injected "error" fault/);
  });

  it('crash: the host is told to close the transport after start-up', async () => {
    const conn = new FakeConnection();
    let crashed = false;
    startVhdlLanguageServer(conn, { fault: 'crash', crashAfterMs: 10, onCrash: () => (crashed = true) });
    await conn.handlers.initialize({});
    conn.handlers.initialized();
    await wait(30);
    expect(crashed).toBe(true);
  });
});
