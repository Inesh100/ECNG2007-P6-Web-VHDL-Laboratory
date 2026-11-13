/**
 * Learning Tool Launch/Result Contract v1 - P6B working model (ECO-StR4.1).
 *
 * P6B supports only the approved *simple* exchange: it accepts a normalised
 * launch context (already produced by the LTI side, Project 7) and returns a
 * normalised completion/result. No LTI/OIDC/JWT handling happens here.
 */

export const LAUNCH_CONTRACT_VERSION = '1.0';

export interface LaunchContext {
  contractVersion: string;
  launchId: string;
  /** Registry id of the activity, e.g. "web-vhdl-lab/counter". */
  activityId: string;
  /** Target type routed by the broker. P6B is always this value. */
  targetType: 'web-vhdl-lab';
  /** Opaque, pseudonymous learner id. */
  learnerId: string;
  courseId?: string;
  /** Completion rule for the activity. */
  completion: { rule: 'successful-run' | 'waveform-viewed' };
  /** Origin allowed to receive the result via postMessage. */
  returnOrigin?: string;
  issuedAt: string;
}

export type ResultStatus = 'completed' | 'incomplete';

export interface CompletionResult {
  contractVersion: string;
  launchId: string;
  activityId: string;
  learnerId: string;
  status: ResultStatus;
  /** Normalised score 0..1. */
  scoreGiven: number;
  scoreMaximum: 1;
  /** Evidence linking the result to the job that produced it. */
  evidence: {
    jobId: string;
    revision: number;
    finalStage: string;
    failureCategory?: string;
    waveformViewed: boolean;
  };
  timestamp: string;
}

/** postMessage envelopes used by the local harness and by embedding hosts. */
export type LaunchMessage =
  | { type: 'p6b.launch'; context: LaunchContext }
  | { type: 'p6b.result'; result: CompletionResult }
  | { type: 'p6b.ready' };

export function validateLaunchContext(value: unknown): string[] {
  const p: string[] = [];
  if (typeof value !== 'object' || value === null) return ['launch context is not an object'];
  const v = value as Record<string, unknown>;
  if (v.contractVersion !== LAUNCH_CONTRACT_VERSION) p.push(`unsupported contractVersion "${String(v.contractVersion)}"`);
  for (const k of ['launchId', 'activityId', 'learnerId', 'issuedAt']) {
    if (typeof v[k] !== 'string' || (v[k] as string).length === 0) p.push(`${k} missing`);
  }
  if (v.targetType !== 'web-vhdl-lab') p.push('targetType must be "web-vhdl-lab"');
  const c = v.completion as Record<string, unknown> | undefined;
  if (!c || (c.rule !== 'successful-run' && c.rule !== 'waveform-viewed')) p.push('completion.rule invalid');
  return p;
}

export function validateCompletionResult(value: unknown): string[] {
  const p: string[] = [];
  if (typeof value !== 'object' || value === null) return ['result is not an object'];
  const v = value as Record<string, unknown>;
  if (v.contractVersion !== LAUNCH_CONTRACT_VERSION) p.push('contractVersion mismatch');
  for (const k of ['launchId', 'activityId', 'learnerId', 'timestamp']) {
    if (typeof v[k] !== 'string') p.push(`${k} missing`);
  }
  if (v.status !== 'completed' && v.status !== 'incomplete') p.push('status invalid');
  if (typeof v.scoreGiven !== 'number' || v.scoreGiven < 0 || v.scoreGiven > 1) p.push('scoreGiven out of range');
  if (v.scoreMaximum !== 1) p.push('scoreMaximum must be 1');
  const e = v.evidence as Record<string, unknown> | undefined;
  if (!e || typeof e.jobId !== 'string') p.push('evidence.jobId missing');
  return p;
}
