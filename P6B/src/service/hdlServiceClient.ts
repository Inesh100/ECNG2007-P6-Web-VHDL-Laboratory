/**
 * HDL Service Contract v1 client (P6B-FR-01/02, P6B-IR-02/03).
 *
 * The three calls P6B makes:
 *   POST {base}/api/v1/jobs                 send a JobRequest   -> { jobId, status, stage }
 *   GET  {base}/api/v1/jobs/{jobId}         ask for the JobResult (used for polling)
 *   WS   {base}/api/v1/jobs/{jobId}/events  live stage/log/final messages (preferred)
 *
 * Rule: run() never throws. If anything goes wrong on the way (network down,
 * HTTP error, bad JSON, timeout) it returns a JobResult whose failure category is
 * "service", so the screen always shows an explicit category (P6B-FR-09).
 */
import {
  HDL_CONTRACT_VERSION,
  isTerminal,
  validateJobResult,
  type Artefact,
  type JobAccepted,
  type JobEvent,
  type JobRequest,
  type JobResult,
  type JobStage,
  type JobStatus,
  type LogEntry,
} from '../contracts/hdlService';
import type { Transport } from './transport';

/** An error from talking to the service. `code` is short, e.g. "NETWORK" or "HTTP_503". */
export class ServiceError extends Error {
  code: string;
  httpStatus?: number;
  constructor(message: string, code: string, httpStatus?: number) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Optional callbacks so the screen can update while the job runs. */
export interface RunCallbacks {
  onAccepted?: (a: JobAccepted) => void;
  onStage?: (stage: JobStage, status: JobStatus) => void;
  onLog?: (entry: LogEntry) => void;
  onChannel?: (channel: 'websocket' | 'polling') => void;
}

export interface ClientOptions {
  pollIntervalMs?: number; // time between GET requests when polling
  timeoutMs?: number; // give up after this long
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HdlServiceClient {
  transport: Transport;
  pollIntervalMs: number;
  timeoutMs: number;

  constructor(transport: Transport, options: ClientOptions = {}) {
    this.transport = transport;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 60000;
  }

  /** Joins the base URL and a path, e.g. "http://host" + "/api/v1/jobs". */
  url(path: string): string {
    let base = this.transport.baseUrl;
    while (base.endsWith('/')) base = base.slice(0, -1);
    return base + path;
  }

  /** Sends one HTTP request and returns the parsed JSON body. Throws ServiceError on any problem. */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.transport.fetch(this.url(path), {
        ...init,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
    } catch (e) {
      throw new ServiceError(`Could not reach the HDL service at ${this.transport.baseUrl} (${(e as Error).message})`, 'NETWORK');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ServiceError(`HDL service returned a non-JSON response (HTTP ${response.status})`, 'MALFORMED', response.status);
    }

    if (!response.ok) {
      const err = (body as { error?: { code?: string; message?: string } }).error;
      const message = err?.message ?? `HDL service returned HTTP ${response.status}`;
      throw new ServiceError(message, err?.code ?? `HTTP_${response.status}`, response.status);
    }
    return body as T;
  }

  health(): Promise<{ status: string; contractVersion?: string; implementation?: string }> {
    return this.request('/api/v1/health');
  }

  async submit(req: JobRequest): Promise<JobAccepted> {
    const accepted = await this.request<JobAccepted>('/api/v1/jobs', { method: 'POST', body: JSON.stringify(req) });
    if (typeof accepted.jobId !== 'string') throw new ServiceError('Job submission response has no jobId', 'MALFORMED');
    return accepted;
  }

  async getJob(jobId: string): Promise<JobResult> {
    const job = await this.request<JobResult>(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
    const problems = validateJobResult(job);
    if (problems.length > 0) throw new ServiceError(`Malformed job result: ${problems.join('; ')}`, 'MALFORMED');
    return job;
  }

  /** Submits a job and waits for its final result. Never throws. */
  async run(req: JobRequest, cb: RunCallbacks = {}): Promise<JobResult> {
    let jobId = 'not-assigned';
    try {
      const accepted = await this.submit(req);
      jobId = accepted.jobId;
      cb.onAccepted?.(accepted);
      cb.onStage?.(accepted.stage ?? 'queued', accepted.status ?? 'queued');
      return await this.watch(jobId, cb);
    } catch (e) {
      return serviceFailure(jobId, e);
    }
  }

  /** Follows a job until it finishes: WebSocket first, polling if the socket is not available. */
  async watch(jobId: string, cb: RunCallbacks = {}): Promise<JobResult> {
    const deadline = Date.now() + this.timeoutMs;
    const fromSocket = await this.watchWithSocket(jobId, cb, deadline);
    if (fromSocket) return fromSocket;
    return this.watchByPolling(jobId, cb, deadline);
  }

  /**
   * Listens on the job's WebSocket. Resolves with the final JobResult, or with
   * null if the socket cannot be used (then the caller falls back to polling).
   */
  watchWithSocket(jobId: string, cb: RunCallbacks, deadline: number): Promise<JobResult | null> {
    const socket = this.transport.openSocket(this.url(`/api/v1/jobs/${encodeURIComponent(jobId)}/events`));
    if (!socket) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (job: JobResult | null, error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        socket.close();
        if (error) reject(error);
        else resolve(job);
      };
      const timer = setTimeout(() => finish(null, new ServiceError(`No final result within ${Math.round(this.timeoutMs / 1000)} s`, 'TIMEOUT')), Math.max(0, deadline - Date.now()));

      socket.onopen = () => cb.onChannel?.('websocket');
      socket.onmessage = (message) => {
        let event: JobEvent;
        try {
          event = JSON.parse(message.data);
        } catch {
          return; // ignore anything that is not JSON
        }
        if (event.type === 'stage') cb.onStage?.(event.stage, event.status);
        if (event.type === 'log') cb.onLog?.(event.entry);
        if (event.type === 'final') {
          const problems = validateJobResult(event.job);
          if (problems.length > 0) finish(null, new ServiceError(`Malformed job result: ${problems.join('; ')}`, 'MALFORMED'));
          else finish(event.job);
        }
      };
      // If the socket fails or closes early, fall back to polling.
      socket.onerror = () => finish(null);
      socket.onclose = () => finish(null);
    });
  }

  /** Asks for the job every pollIntervalMs until it is finished or the deadline passes. */
  async watchByPolling(jobId: string, cb: RunCallbacks, deadline: number): Promise<JobResult> {
    cb.onChannel?.('polling');
    let lastStage: JobStage | undefined;
    let logsSeen = 0;

    while (true) {
      const job = await this.getJob(jobId);
      if (job.stage !== lastStage) {
        lastStage = job.stage;
        cb.onStage?.(job.stage, job.status);
      }
      for (const entry of job.logs.slice(logsSeen)) cb.onLog?.(entry);
      logsSeen = job.logs.length;

      if (isTerminal(job.status)) return job;
      if (Date.now() > deadline) throw new ServiceError(`No final result within ${Math.round(this.timeoutMs / 1000)} s`, 'TIMEOUT');
      await sleep(this.pollIntervalMs);
    }
  }

  /** Returns the VCD text of an artefact, either inline or downloaded from its URL. */
  async fetchArtefact(artefact: Artefact): Promise<string> {
    if (typeof artefact.content === 'string') return artefact.content;
    if (!artefact.url) throw new ServiceError(`Artefact ${artefact.name} has neither content nor url`, 'MALFORMED');

    let url = artefact.url;
    if (!url.startsWith('http')) url = this.url(url.startsWith('/') ? url : '/' + url);

    let response: Response;
    try {
      response = await this.transport.fetch(url, { headers: { Accept: 'text/plain' } });
    } catch (e) {
      throw new ServiceError(`Could not download ${artefact.name}: ${(e as Error).message}`, 'NETWORK');
    }
    if (!response.ok) throw new ServiceError(`Could not download ${artefact.name} (HTTP ${response.status})`, `HTTP_${response.status}`, response.status);
    return response.text();
  }
}

/** Turns any client-side error into a "service/runtime" JobResult for the screen. */
export function serviceFailure(jobId: string, e: unknown): JobResult {
  const err = e instanceof ServiceError ? e : new ServiceError(String((e as Error)?.message ?? e), 'UNKNOWN');
  const httpPart = err.httpStatus ? ` (HTTP ${err.httpStatus})` : '';
  return {
    contractVersion: HDL_CONTRACT_VERSION,
    jobId,
    status: 'failed',
    stage: 'queued',
    failure: { category: 'service', message: err.message, diagnostics: [] },
    logs: [{ stage: 'service', stream: 'stderr', text: `p6b-client: ${err.code}${httpPart}: ${err.message}` }],
    artefacts: [],
  };
}
