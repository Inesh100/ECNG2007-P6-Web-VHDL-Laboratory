/**
 * Embedded transport: routes the client's REST and WebSocket calls to the
 * parent-project service simulator running inside the page. The client code is
 * unchanged - it still builds URLs, sends JSON and parses HTTP responses - so
 * the contract path is exercised without any server (P6B-FR-05, P6B-IR-07).
 *
 * Fault injection lets testers reproduce transport-level service/runtime
 * failures (P6B-FR-09): an unavailable service and a malformed response.
 */
import type { JobRequest } from '../contracts/hdlService';
import { JobStore } from '../simulator/jobStore';
import type { FetchLike, SocketLike, Transport } from './transport';

export type Fault = 'none' | 'unavailable' | 'malformed';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export class EmbeddedTransport implements Transport {
  readonly kind = 'embedded' as const;
  readonly baseUrl = 'http://service-simulator.p6b.invalid';
  fault: Fault = 'none';

  constructor(readonly store: JobStore = new JobStore()) {}

  fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/+/, '/');
    const method = (init?.method ?? 'GET').toUpperCase();
    await new Promise((r) => setTimeout(r, 30)); // keep calls asynchronous like the network

    if (this.fault === 'unavailable') return json(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'HDL execution service is unavailable (simulated fault)' } });

    if (path === '/api/v1/health' && method === 'GET') return json(200, { status: 'ok', contractVersion: '1.0', implementation: 'p6b-service-simulator' });

    if (path === '/api/v1/jobs' && method === 'POST') {
      let body: JobRequest;
      try {
        body = JSON.parse(String(init?.body ?? ''));
      } catch {
        return json(400, { error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
      }
      const job = this.store.create(body);
      if (this.fault === 'malformed') return json(202, { id: job.jobId, state: 'QUEUED' });
      return json(202, { jobId: job.jobId, status: job.status, stage: job.stage });
    }

    const m = /^\/api\/v1\/jobs\/([^/]+)$/.exec(path);
    if (m && method === 'GET') {
      const job = this.store.get(m[1]);
      if (!job) return json(404, { error: { code: 'NOT_FOUND', message: `No job ${m[1]}` } });
      if (this.fault === 'malformed') return json(200, { ...job, status: 'DONE', stage: 42 });
      return json(200, job);
    }
    return json(404, { error: { code: 'NOT_FOUND', message: `${method} ${path} is not part of the contract` } });
  };

  openSocket(url: string): SocketLike | undefined {
    if (this.fault !== 'none') return undefined; // force REST polling path under faults
    const m = /\/api\/v1\/jobs\/([^/]+)\/events$/.exec(new URL(url).pathname);
    if (!m) return undefined;
    const jobId = m[1];
    const sock: SocketLike & { unsub?: () => void } = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: () => {
        sock.unsub?.();
        setTimeout(() => sock.onclose?.({}), 0);
      },
    };
    setTimeout(() => {
      sock.onopen?.({});
      sock.unsub = this.store.subscribe(jobId, (e) => sock.onmessage?.({ data: JSON.stringify(e) }));
      if (!sock.unsub) sock.onerror?.({});
    }, 10);
    return sock;
  }
}
