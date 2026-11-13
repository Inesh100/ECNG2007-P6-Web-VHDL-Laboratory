/**
 * HDL Service Contract v1 - P6B working model.
 *
 * The normative contract is staff-owned (ECO-StR3.1). These types are P6B's
 * working copy of the execution portion it consumes (P6B-IR-02). If the frozen
 * staff contract differs, this file is the single place to change, raised as a
 * Change Request (see docs/change-log.md, CR-P6B-01).
 */

export const HDL_CONTRACT_VERSION = '1.0';

/** Pipeline stages a GHDL job passes through. */
export type JobStage = 'queued' | 'analysis' | 'elaboration' | 'simulation' | 'completed';

/** Overall job status. */
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** The four failure categories P6B must distinguish (P6B-FR-06..09). */
export type FailureCategory = 'analysis' | 'elaboration' | 'simulation' | 'service';

export type FileRole = 'design' | 'testbench';

export interface SourceFile {
  /** Path inside the prescribed file model, e.g. "src/counter.vhd". */
  path: string;
  role: FileRole;
  content: string;
}

export interface JobOptions {
  /** VHDL standard passed to GHDL (--std). Course default is 08. */
  vhdlStandard: '93' | '08';
  /** Simulation stop time, e.g. "200ns". */
  stopTime: string;
  /** Requested waveform format. Only VCD is in scope. */
  waveform: 'vcd' | 'none';
}

/** POST /api/v1/jobs request body. */
export interface JobRequest {
  contractVersion: string;
  /** Opaque correlation id for the browser workspace/session (from P6A seam). */
  sessionId: string;
  /** Workspace revision that was submitted, so results can be tied to source. */
  revision: number;
  /** Top-level testbench entity name (Course HDL Artefact Convention v1). */
  top: string;
  files: SourceFile[];
  options: JobOptions;
}

/** POST /api/v1/jobs response (202). */
export interface JobAccepted {
  jobId: string;
  status: JobStatus;
  stage: JobStage;
}

export type Severity = 'error' | 'warning' | 'note';

export interface ToolDiagnostic {
  file?: string;
  line?: number;
  column?: number;
  severity: Severity;
  message: string;
}

export interface LogEntry {
  stage: Exclude<JobStage, 'queued' | 'completed'> | 'service';
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface JobFailure {
  category: FailureCategory;
  message: string;
  diagnostics: ToolDiagnostic[];
}

export interface JobResultInfo {
  exitCode: number;
  durationMs: number;
  /** Simulation time reached, e.g. "200 ns". */
  simulatedTime?: string;
  /** Human-readable summary returned by the service. */
  summary: string;
  /** Assertion/report output counted by the service. */
  reports?: { severity: 'note' | 'warning' | 'error' | 'failure'; message: string; time?: string }[];
}

export interface Artefact {
  kind: 'vcd';
  name: string;
  /** Relative or absolute URL from which the artefact can be fetched. */
  url?: string;
  /** Inline content (used by small fixtures and the embedded simulator). */
  content?: string;
  sizeBytes?: number;
}

/** GET /api/v1/jobs/{jobId} response. */
export interface JobResult {
  contractVersion: string;
  jobId: string;
  status: JobStatus;
  stage: JobStage;
  failure?: JobFailure;
  result?: JobResultInfo;
  logs: LogEntry[];
  artefacts: Artefact[];
}

/** Messages pushed over WS /api/v1/jobs/{jobId}/events. */
export type JobEvent =
  | { type: 'stage'; jobId: string; stage: JobStage; status: JobStatus }
  | { type: 'log'; jobId: string; entry: LogEntry }
  | { type: 'final'; jobId: string; job: JobResult };

/** Error body returned by the service for non-2xx responses. */
export interface ServiceErrorBody {
  error: { code: string; message: string };
}

const STAGES: JobStage[] = ['queued', 'analysis', 'elaboration', 'simulation', 'completed'];
const STATUSES: JobStatus[] = ['queued', 'running', 'succeeded', 'failed'];
const CATEGORIES: FailureCategory[] = ['analysis', 'elaboration', 'simulation', 'service'];

/**
 * Structural check of a JobResult received over the wire. Returns a list of
 * problems; an empty list means the payload is usable. Malformed payloads are
 * reported to the learner as service/runtime failures, never guessed at.
 */
export function validateJobResult(value: unknown): string[] {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null) return ['response is not an object'];
  const v = value as Record<string, unknown>;
  if (typeof v.jobId !== 'string') problems.push('jobId missing');
  if (!STATUSES.includes(v.status as JobStatus)) problems.push(`unknown status "${String(v.status)}"`);
  if (!STAGES.includes(v.stage as JobStage)) problems.push(`unknown stage "${String(v.stage)}"`);
  if (!Array.isArray(v.logs)) problems.push('logs must be an array');
  if (!Array.isArray(v.artefacts)) problems.push('artefacts must be an array');
  if (v.status === 'failed') {
    const f = v.failure as Record<string, unknown> | undefined;
    if (!f) problems.push('failed job has no failure block');
    else if (!CATEGORIES.includes(f.category as FailureCategory))
      problems.push(`unknown failure category "${String(f.category)}"`);
  }
  return problems;
}

export function isTerminal(status: JobStatus): boolean {
  return status === 'succeeded' || status === 'failed';
}
