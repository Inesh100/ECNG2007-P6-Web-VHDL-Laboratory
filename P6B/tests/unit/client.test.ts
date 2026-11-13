// UT-CLI: HDL service client against controllable transport doubles.
import { describe, expect, it } from 'vitest';
import type { JobRequest, JobResult } from '../../src/contracts/hdlService';
import { EmbeddedTransport } from '../../src/service/embeddedTransport';
import { HdlServiceClient } from '../../src/service/hdlServiceClient';
import type { SocketLike, Transport } from '../../src/service/transport';
import { JobStore } from '../../src/simulator/jobStore';
import { referenceFiles } from '../../src/simulator/referenceFiles';

const req: JobRequest = { contractVersion: '1.0', sessionId: 's', revision: 1, top: 'tb_counter', files: referenceFiles(), options: { vhdlStandard: '08', stopTime: '250ns', waveform: 'vcd' } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const done: JobResult = { contractVersion: '1.0', jobId: 'j1', status: 'succeeded', stage: 'completed', logs: [{ stage: 'simulation', stream: 'stdout', text: 'ok' }], artefacts: [{ kind: 'vcd', name: 'tb.vcd', url: '/api/v1/jobs/j1/artefacts/tb.vcd' }] };

function fakeTransport(handler: (url: string, init?: RequestInit) => Promise<Response>, socket?: () => SocketLike | undefined): Transport {
  return { kind: 'test', baseUrl: 'http://svc', fetch: handler, openSocket: () => socket?.() };
}

describe('UT-CLI-01 REST polling path', () => {
  it('submits, polls to completion and reports stages and logs once', async () => {
    let polls = 0;
    const calls: string[] = [];
    const t = fakeTransport(async (url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'POST') return json(202, { jobId: 'j1', status: 'queued', stage: 'queued' });
      polls++;
      return json(200, polls < 2 ? { ...done, status: 'running', stage: 'analysis', logs: [] } : done);
    });
    const stages: string[] = [];
    const logs: string[] = [];
    let channel = '';
    const r = await new HdlServiceClient(t, { pollIntervalMs: 1 }).run(req, { onStage: (s) => stages.push(s), onLog: (l) => logs.push(l.text), onChannel: (c) => (channel = c) });
    expect(r.status).toBe('succeeded');
    expect(calls[0]).toBe('POST http://svc/api/v1/jobs');
    expect(stages).toEqual(['queued', 'analysis', 'completed']);
    expect(logs).toEqual(['ok']);
    expect(channel).toBe('polling');
  });
});

describe('UT-CLI-02 WebSocket path with the embedded simulator', () => {
  it('receives stage events and the final result', async () => {
    const t = new EmbeddedTransport(new JobStore(1));
    const stages: string[] = [];
    let channel = '';
    const r = await new HdlServiceClient(t).run(req, { onStage: (s) => stages.push(s), onChannel: (c) => (channel = c) });
    expect(channel).toBe('websocket');
    expect(stages).toEqual(['queued', 'analysis', 'elaboration', 'simulation', 'completed']);
    expect(r.status).toBe('succeeded');
    expect(r.artefacts[0].content).toContain('$enddefinitions');
  });
});

describe('UT-CLI-03 transport failures become service/runtime failures (P6B-FR-09)', () => {
  it('HTTP 503', async () => {
    const t = new EmbeddedTransport(new JobStore(1));
    t.fault = 'unavailable';
    const r = await new HdlServiceClient(t).run(req);
    expect(r.failure).toMatchObject({ category: 'service' });
    expect(r.failure!.message).toContain('unavailable');
    expect(r.logs[0].text).toContain('HTTP 503');
  });
  it('malformed contract response', async () => {
    const t = new EmbeddedTransport(new JobStore(1));
    t.fault = 'malformed';
    const r = await new HdlServiceClient(t).run(req);
    expect(r.failure?.category).toBe('service');
  });
  it('network error', async () => {
    const r = await new HdlServiceClient(fakeTransport(() => Promise.reject(new TypeError('Failed to fetch')))).run(req);
    expect(r.failure?.category).toBe('service');
    expect(r.failure?.message).toContain('Could not reach');
  });
  it('non-JSON body', async () => {
    const r = await new HdlServiceClient(fakeTransport(async () => new Response('<html>', { status: 502 }))).run(req);
    expect(r.failure?.message).toContain('non-JSON');
  });
  it('no final result before the timeout', async () => {
    const t = fakeTransport(async (_u, init) => (init?.method === 'POST' ? json(202, { jobId: 'j', status: 'queued', stage: 'queued' }) : json(200, { ...done, status: 'running', stage: 'simulation' })));
    const r = await new HdlServiceClient(t, { pollIntervalMs: 5, timeoutMs: 40 }).run(req);
    expect(r.failure?.message).toContain('No final result');
  });
});

describe('UT-CLI-04 artefacts', () => {
  it('returns inline content directly and downloads URL artefacts', async () => {
    const t = fakeTransport(async (url) => (url === 'http://svc/api/v1/jobs/j1/artefacts/tb.vcd' ? new Response('$vcd') : json(404, {})));
    const c = new HdlServiceClient(t);
    expect(await c.fetchArtefact({ kind: 'vcd', name: 'a', content: 'inline' })).toBe('inline');
    expect(await c.fetchArtefact(done.artefacts[0])).toBe('$vcd');
    await expect(c.fetchArtefact({ kind: 'vcd', name: 'x', url: '/missing' })).rejects.toThrow('HTTP 404');
  });
});
