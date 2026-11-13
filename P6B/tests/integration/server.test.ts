// IT-SVC: the real REST + WebSocket path, P6B client <-> Node service simulator.
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startSimulator } from '../../simulator/server';
import { HdlServiceClient } from '../../src/service/hdlServiceClient';
import { HttpTransport } from '../../src/service/transport';
import { HDL_CASES } from '../../src/simulator/fixtures';

let inline: Awaited<ReturnType<typeof startSimulator>>;
let byUrl: Awaited<ReturnType<typeof startSimulator>>;

beforeAll(async () => {
  inline = await startSimulator(0, { stepDelayMs: 5 });
  byUrl = await startSimulator(0, { stepDelayMs: 5, artefactUrls: true });
});
afterAll(async () => {
  await inline.close();
  await byUrl.close();
});

const reqFor = (id: string) => {
  const c = HDL_CASES.find((x) => x.id === id)!;
  return { contractVersion: '1.0', sessionId: 'it', revision: 1, top: c.top, files: c.files, options: c.options };
};

describe('IT-SVC-01 health and contract version', () => {
  it('reports contract 1.0', async () => {
    const h = await new HdlServiceClient(new HttpTransport(`http://localhost:${inline.port}`)).health();
    expect(h.contractVersion).toBe('1.0');
  });
});

describe('IT-SVC-02 WebSocket event stream over real HTTP', () => {
  it('follows the reference job to success via WebSocket', async () => {
    const client = new HdlServiceClient(new HttpTransport(`http://localhost:${inline.port}`));
    let channel = '';
    const stages: string[] = [];
    const r = await client.run(reqFor('HDL-01'), { onChannel: (c) => (channel = c), onStage: (s) => stages.push(s) });
    expect(typeof WebSocket === 'undefined' ? 'polling' : 'websocket').toBe(channel);
    expect(r.status).toBe('succeeded');
    expect(stages.at(-1)).toBe('completed');
    expect(r.artefacts[0].content).toContain('$timescale 1ns $end');
  });
});

describe('IT-SVC-03 every published case over HTTP', () => {
  it.each(HDL_CASES.map((c) => [c.id, c] as const))('%s', async (id, c) => {
    const r = await new HdlServiceClient(new HttpTransport(`http://localhost:${inline.port}`), { pollIntervalMs: 5 }).run(reqFor(id));
    expect(r.status).toBe(c.expected.status);
    expect(r.failure?.category).toBe(c.expected.category);
  });
});

describe('IT-SVC-04 VCD artefact returned by URL is downloadable', () => {
  it('fetches the VCD from the artefact endpoint', async () => {
    const client = new HdlServiceClient(new HttpTransport(`http://localhost:${byUrl.port}`), { pollIntervalMs: 5 });
    const r = await client.run(reqFor('HDL-01'));
    const art = r.artefacts[0];
    expect(art.content).toBeUndefined();
    expect(art.url).toMatch(/\/artefacts\/tb_counter\.vcd$/);
    expect(await client.fetchArtefact(art)).toContain('$enddefinitions $end');
  });
});

describe('IT-SVC-05 unreachable endpoint', () => {
  it('maps a refused connection to a service/runtime failure', async () => {
    const r = await new HdlServiceClient(new HttpTransport('http://localhost:1')).run(reqFor('HDL-01'));
    expect(r.failure?.category).toBe('service');
  });
});
