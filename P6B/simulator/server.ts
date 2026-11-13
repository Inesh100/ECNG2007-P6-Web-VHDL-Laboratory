/**
 * Parent-project service simulator - REST + WebSocket server.
 *
 * Exposes HDL Service Contract v1 over real HTTP so P6B's REST/WebSocket client
 * can be verified end to end without Project 5 (P6B-FR-05, P6B-DC-04):
 *
 *   GET  /api/v1/health
 *   POST /api/v1/jobs
 *   GET  /api/v1/jobs/:jobId
 *   GET  /api/v1/jobs/:jobId/artefacts/:name      (VCD download)
 *   WS   /api/v1/jobs/:jobId/events
 *
 * Usage:  npm run simulator            (port 8787, or PORT=...)
 *         npm run simulator -- --artefact-urls   (return VCD by URL, not inline)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { JobRequest, JobResult } from '../src/contracts/hdlService';
import { JobStore } from '../src/simulator/jobStore';

export function startSimulator(port = Number(process.env.PORT ?? 8787), opts: { stepDelayMs?: number; artefactUrls?: boolean } = {}) {
  const store = new JobStore(opts.stepDelayMs ?? 400);

  const shape = (job: JobResult): JobResult =>
    !opts.artefactUrls
      ? job
      : { ...job, artefacts: job.artefacts.map((a) => ({ kind: a.kind, name: a.name, sizeBytes: a.sizeBytes, url: `/api/v1/jobs/${job.jobId}/artefacts/${a.name}` })) };

  const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
    res.writeHead(status, {
      'Content-Type': type,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (path === '/api/v1/health' && req.method === 'GET') return send(res, 200, { status: 'ok', contractVersion: '1.0', implementation: 'p6b-service-simulator (node)' });

    if (path === '/api/v1/jobs' && req.method === 'POST') {
      let body: JobRequest;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
      }
      const job = store.create(body);
      return send(res, 202, { jobId: job.jobId, status: job.status, stage: job.stage });
    }

    let m = /^\/api\/v1\/jobs\/([^/]+)$/.exec(path);
    if (m && req.method === 'GET') {
      const job = store.get(m[1]);
      return job ? send(res, 200, shape(job)) : send(res, 404, { error: { code: 'NOT_FOUND', message: `No job ${m[1]}` } });
    }

    m = /^\/api\/v1\/jobs\/([^/]+)\/artefacts\/([^/]+)$/.exec(path);
    if (m && req.method === 'GET') {
      const art = store.get(m[1])?.artefacts.find((a) => a.name === decodeURIComponent(m![2]));
      return art?.content ? send(res, 200, art.content, 'text/plain') : send(res, 404, { error: { code: 'NOT_FOUND', message: 'No such artefact' } });
    }
    send(res, 404, { error: { code: 'NOT_FOUND', message: `${req.method} ${path} is not part of the contract` } });
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const m = /^\/api\/v1\/jobs\/([^/]+)\/events$/.exec(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (!m) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      const unsub = store.subscribe(m[1], (e) => {
        const out = e.type === 'final' ? { ...e, job: shape(e.job) } : e;
        ws.send(JSON.stringify(out));
        if (e.type === 'final') setTimeout(() => ws.close(), 50);
      });
      if (!unsub) ws.close(4404, 'unknown job');
      ws.on('close', () => unsub?.());
    });
  });

  return new Promise<{ close: () => Promise<void>; port: number }>((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      const actual = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: actual,
        close: () => new Promise<void>((r) => { wss.close(); server.close(() => r()); }),
      });
    });
  });
}

// Run directly: tsx simulator/server.ts
if (process.argv[1] && /server\.ts$/.test(process.argv[1])) {
  const artefactUrls = process.argv.includes('--artefact-urls');
  startSimulator(undefined, { artefactUrls }).then(({ port }) => {
    console.log(`P6B service simulator listening on http://localhost:${port} (HDL Service Contract v1)${artefactUrls ? ' [artefacts by URL]' : ''}`);
  });
}
