/**
 * UT-LSC-01..04: language-client settings, status indicator model (DE-A-05)
 * and the Problems list.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMEOUT_MS, describeLsConfig, parseLsConfig } from '../../src/lsp/config';
import { STATUS_OFF, connecting, ready, reasonOf, unavailable, withTimeout } from '../../src/lsp/status';
import { MARKER_SEVERITY, severityFromMarker, sortProblems, summarize, type ProblemItem } from '../../src/editor/problems';

describe('parseLsConfig (UT-LSC-01)', () => {
  it('defaults to the in-browser worker simulator', () => {
    expect(parseLsConfig('')).toEqual({ transport: 'worker', fault: 'none', timeoutMs: DEFAULT_TIMEOUT_MS });
  });
  it('accepts a WebSocket language server, faults and a timeout', () => {
    expect(parseLsConfig('?lsp=ws://localhost:8790/vhdl&lspFault=crash&lspTimeout=1500')).toEqual({
      transport: 'websocket',
      url: 'ws://localhost:8790/vhdl',
      fault: 'crash',
      timeoutMs: 1500,
    });
    expect(parseLsConfig('?lspFault=bogus').fault).toBe('none');
    expect(parseLsConfig('?lsp=off&lspFault=error')).toEqual({ transport: 'off', fault: 'none', timeoutMs: DEFAULT_TIMEOUT_MS });
  });
  it('describes the connection for the status tooltip', () => {
    expect(describeLsConfig(parseLsConfig(''))).toContain('Web Worker');
    expect(describeLsConfig(parseLsConfig('?lsp=wss://p5.example/ls&lspFault=timeout'))).toBe('language server at wss://p5.example/ls, injected fault: timeout');
  });
});

describe('status (UT-LSC-02, DE-A-05)', () => {
  it('only the unavailable state offers Retry, and it says editing still works', () => {
    for (const s of [STATUS_OFF, connecting('x'), ready('x')]) expect(s.canRetry).toBe(false);
    const u = unavailable('The connection was refused');
    expect(u).toMatchObject({ state: 'unavailable', canRetry: true });
    expect(u.detail).toContain('Editing still works');
  });
  it('turns thrown values into readable reasons', () => {
    expect(reasonOf(new Error('boom'))).toBe('boom');
    expect(reasonOf('plain')).toBe('plain');
    expect(reasonOf({ message: 'obj' })).toBe('obj');
    expect(reasonOf(undefined)).toBe('Unknown language-service error');
  });
  it('withTimeout rejects slow promises and passes fast ones (UT-LSC-03)', async () => {
    expect(await withTimeout(Promise.resolve(7), 50, "slow")).toBe(7);
    let msg = '';
    await withTimeout(new Promise(() => undefined), 10, 'timed out').catch((e: Error) => (msg = e.message));
    expect(msg).toBe('timed out');
  });
});

describe('problems (UT-LSC-04)', () => {
  const p = (path: string, line: number, severity: ProblemItem['severity']): ProblemItem => ({ path, line, column: 1, severity, message: 'm' });
  it('maps Monaco marker severities', () => {
    expect(severityFromMarker(MARKER_SEVERITY.Error)).toBe('error');
    expect(severityFromMarker(MARKER_SEVERITY.Warning)).toBe('warning');
    expect(severityFromMarker(MARKER_SEVERITY.Info)).toBe('info');
  });
  it('counts and orders like VS Code', () => {
    const items = [p('tb/tb_counter.vhd', 1, 'error'), p('src/counter.vhd', 9, 'warning'), p('src/counter.vhd', 2, 'error')];
    expect(summarize(items)).toEqual({ errors: 2, warnings: 1 });
    expect(sortProblems(items, ['src/counter.vhd', 'tb/tb_counter.vhd']).map((i) => `${i.path}:${i.line}`)).toEqual([
      'src/counter.vhd:2',
      'src/counter.vhd:9',
      'tb/tb_counter.vhd:1',
    ]);
  });
});
