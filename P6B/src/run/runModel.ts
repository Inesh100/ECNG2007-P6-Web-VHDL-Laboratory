/**
 * Pure functions that turn workspace state into a job request and a job result
 * into what the run/results UI shows. Kept free of React so they can be unit
 * tested directly.
 */
import {
  HDL_CONTRACT_VERSION,
  type FailureCategory,
  type JobOptions,
  type JobRequest,
  type JobResult,
  type JobStage,
} from '../contracts/hdlService';
import type { WorkspaceSnapshot } from '../workspace/types';

/**
 * P6B-FR-02/04/18: builds the contract request from the snapshot exactly as
 * published - same paths, roles, content and top. No restructuring.
 */
export function buildJobRequest(snapshot: WorkspaceSnapshot, options: JobOptions): JobRequest {
  return {
    contractVersion: HDL_CONTRACT_VERSION,
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    top: snapshot.top,
    files: snapshot.files.map((f) => ({ path: f.path, role: f.role, content: f.content })),
    options: { ...options },
  };
}

/** Explicit, learner-facing text for each failure category (P6B-UR-01). */
export const CATEGORY_LABEL: Record<FailureCategory, string> = {
  analysis: 'Analysis failure',
  elaboration: 'Elaboration failure',
  simulation: 'Simulation failure',
  service: 'Service/runtime failure',
};

export const CATEGORY_HELP: Record<FailureCategory, string> = {
  analysis: 'GHDL could not analyse (compile) a source file. Check the syntax errors listed under Problems.',
  elaboration: 'All files analysed, but the design could not be built from the top-level unit. Check entity names, generics and port widths.',
  simulation: 'The design was built, but the simulation stopped with an error, usually a failing assertion in the testbench.',
  service: 'The job could not be run by the HDL service (unreachable, overloaded, over its time limit or returned an invalid response). Your VHDL may be fine.',
};

export type StepState = 'pending' | 'active' | 'passed' | 'failed' | 'skipped';
export const PIPELINE: Exclude<JobStage, 'queued'>[] = ['analysis', 'elaboration', 'simulation', 'completed'];

/** Works out the state of each pipeline step for the stepper UI. */
export function pipelineStates(stage: JobStage, status: JobResult['status'] | 'idle', category?: FailureCategory): Record<string, StepState> {
  const out: Record<string, StepState> = {};
  const order: JobStage[] = ['queued', ...PIPELINE];
  const idx = order.indexOf(stage);
  for (const step of PIPELINE) {
    const si = order.indexOf(step);
    if (status === 'idle') out[step] = 'pending';
    else if (status === 'failed' && category === 'service') out[step] = si < idx ? 'passed' : 'skipped';
    else if (status === 'failed') out[step] = si < idx ? 'passed' : si === idx ? 'failed' : 'skipped';
    else if (status === 'succeeded') out[step] = 'passed';
    else out[step] = si < idx ? 'passed' : si === idx ? 'active' : 'pending';
  }
  return out;
}

export function hasWaveform(job?: JobResult): boolean {
  return !!job && job.status === 'succeeded' && job.artefacts.some((a) => a.kind === 'vcd');
}
