/**
 * In-memory job store for the service simulator. Runs the deterministic engine
 * and releases its stages over time, so clients see queued -> analysis ->
 * elaboration -> simulation -> completed exactly as a real service would stream
 * them. Shared by the embedded (in-browser) transport and the Node server.
 */
import { HDL_CONTRACT_VERSION, type JobEvent, type JobRequest, type JobResult } from '../contracts/hdlService';
import { runJob } from './engine';

type Listener = (e: JobEvent) => void;

interface JobRecord {
  current: JobResult;
  final: JobResult;
  listeners: Set<Listener>;
  history: JobEvent[];
}

export class JobStore {
  private jobs = new Map<string, JobRecord>();
  private seq = 0;

  /** @param stepDelayMs delay between stage transitions (0 in unit tests). */
  constructor(private stepDelayMs = 400, private schedule: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms)) {}

  create(req: JobRequest): JobResult {
    this.seq += 1;
    const jobId = `job-${Date.now().toString(36)}-${this.seq}`;
    const outcome = runJob(req);
    const final: JobResult = { ...outcome.result, jobId };
    const current: JobResult = {
      contractVersion: HDL_CONTRACT_VERSION,
      jobId,
      status: 'queued',
      stage: 'queued',
      logs: [],
      artefacts: [],
    };
    const rec: JobRecord = { current, final, listeners: new Set(), history: [] };
    this.jobs.set(jobId, rec);

    // Release each engine step in order, then the final result.
    const steps = outcome.steps.filter((s) => s.stage !== 'queued' || s.logs.length > 0);
    steps.forEach((step, i) => {
      this.schedule(() => {
        const logs = [...rec.current.logs, ...step.logs];
        rec.current = { ...rec.current, status: 'running', stage: step.stage, logs };
        this.emit(rec, { type: 'stage', jobId, stage: step.stage, status: 'running' });
        for (const entry of step.logs) this.emit(rec, { type: 'log', jobId, entry });
      }, this.stepDelayMs * (i + 1));
    });
    this.schedule(() => {
      rec.current = final;
      this.emit(rec, { type: 'final', jobId, job: final });
    }, this.stepDelayMs * (steps.length + 1));
    return current;
  }

  get(jobId: string): JobResult | undefined {
    return this.jobs.get(jobId)?.current;
  }

  /** Subscribe to events; already-emitted events are replayed first. */
  subscribe(jobId: string, listener: Listener): (() => void) | undefined {
    const rec = this.jobs.get(jobId);
    if (!rec) return undefined;
    for (const e of rec.history) listener(e);
    rec.listeners.add(listener);
    return () => rec.listeners.delete(listener);
  }

  private emit(rec: JobRecord, e: JobEvent) {
    rec.history.push(e);
    for (const l of rec.listeners) l(e);
  }
}
