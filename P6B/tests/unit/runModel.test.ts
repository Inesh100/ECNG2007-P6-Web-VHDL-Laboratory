// UT-RUN: request building and result presentation logic.
import { describe, expect, it } from 'vitest';
import { buildJobRequest, CATEGORY_LABEL, hasWaveform, pipelineStates } from '../../src/run/runModel';
import { FixtureWorkspace } from '../../src/workspace/fixtureWorkspace';
import type { JobResult } from '../../src/contracts/hdlService';

const opts = { vhdlStandard: '08' as const, stopTime: '250ns', waveform: 'vcd' as const };

describe('UT-RUN-01 buildJobRequest (P6B-FR-02/04)', () => {
  it('copies the snapshot without restructuring', () => {
    const ws = new FixtureWorkspace();
    ws.updateFile('src/counter.vhd', '-- edited\n' + ws.getSnapshot().files[0].content);
    const snap = ws.getSnapshot();
    const r = buildJobRequest(snap, opts);
    expect(r.contractVersion).toBe('1.0');
    expect(r.revision).toBe(2);
    expect(r.sessionId).toBe(snap.sessionId);
    expect(r.top).toBe('tb_counter');
    expect(r.files).toEqual(snap.files.map(({ path, role, content }) => ({ path, role, content })));
    expect(r.files[0].content.startsWith('-- edited')).toBe(true);
  });
  it('does not share option objects with the caller', () => {
    const r = buildJobRequest(new FixtureWorkspace().getSnapshot(), opts);
    expect(r.options).not.toBe(opts);
  });
});

describe('UT-RUN-02 explicit category labels (P6B-UR-01)', () => {
  it('has distinct text for every category', () => {
    expect(CATEGORY_LABEL).toEqual({
      analysis: 'Analysis failure',
      elaboration: 'Elaboration failure',
      simulation: 'Simulation failure',
      service: 'Service/runtime failure',
    });
  });
});

describe('UT-RUN-03 pipelineStates', () => {
  it('marks the failing stage and skips later stages', () => {
    expect(pipelineStates('elaboration', 'failed', 'elaboration')).toEqual({ analysis: 'passed', elaboration: 'failed', simulation: 'skipped', completed: 'skipped' });
  });
  it('shows progress while running', () => {
    expect(pipelineStates('simulation', 'running')).toEqual({ analysis: 'passed', elaboration: 'passed', simulation: 'active', completed: 'pending' });
  });
  it('does not blame a GHDL stage for a service failure', () => {
    expect(Object.values(pipelineStates('queued', 'failed', 'service'))).toEqual(['skipped', 'skipped', 'skipped', 'skipped']);
  });
  it('is all passed on success and all pending when idle', () => {
    expect(Object.values(pipelineStates('completed', 'succeeded')).every((s) => s === 'passed')).toBe(true);
    expect(Object.values(pipelineStates('queued', 'idle')).every((s) => s === 'pending')).toBe(true);
  });
});

describe('UT-RUN-04 hasWaveform (P6B-FR-14)', () => {
  const job = (status: JobResult['status'], vcd: boolean): JobResult => ({ contractVersion: '1.0', jobId: 'j', status, stage: 'completed', logs: [], artefacts: vcd ? [{ kind: 'vcd', name: 'a.vcd', content: '' }] : [] });
  it('only enables the waveform for a successful job with a VCD', () => {
    expect(hasWaveform(job('succeeded', true))).toBe(true);
    expect(hasWaveform(job('succeeded', false))).toBe(false);
    expect(hasWaveform(job('failed', true))).toBe(false);
    expect(hasWaveform(undefined)).toBe(false);
  });
});
