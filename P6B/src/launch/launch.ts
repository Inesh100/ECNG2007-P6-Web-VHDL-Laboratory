/**
 * Simple learning-tool launch/result hook (P6B-FR-15..17, P6B-IR-05/06).
 *
 * Launch:  ?launch=<base64url(JSON LaunchContext)>   or
 *          postMessage { type: 'p6b.launch', context } from parent/opener
 * Result:  postMessage { type: 'p6b.result', result } to parent/opener
 */
import type { JobResult } from '../contracts/hdlService';
import {
  LAUNCH_CONTRACT_VERSION,
  validateLaunchContext,
  type CompletionResult,
  type LaunchContext,
  type LaunchMessage,
} from '../contracts/launchResult';

export function encodeLaunch(ctx: LaunchContext): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ctx));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLaunch(param: string): unknown {
  const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export interface LaunchParseResult {
  context?: LaunchContext;
  errors: string[];
}

export function parseLaunchParam(search: string): LaunchParseResult | undefined {
  const raw = new URLSearchParams(search).get('launch');
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = decodeLaunch(raw);
  } catch {
    return { errors: ['launch parameter is not valid base64url JSON'] };
  }
  const errors = validateLaunchContext(value);
  return errors.length ? { errors } : { context: value as LaunchContext, errors };
}

/** P6B-FR-16: builds the normalised completion/result for a finished job. */
export function buildCompletionResult(ctx: LaunchContext, job: JobResult, revision: number, waveformViewed: boolean, now = new Date()): CompletionResult {
  const succeeded = job.status === 'succeeded';
  const completed = ctx.completion.rule === 'successful-run' ? succeeded : succeeded && waveformViewed;
  return {
    contractVersion: LAUNCH_CONTRACT_VERSION,
    launchId: ctx.launchId,
    activityId: ctx.activityId,
    learnerId: ctx.learnerId,
    status: completed ? 'completed' : 'incomplete',
    scoreGiven: completed ? 1 : 0,
    scoreMaximum: 1,
    evidence: {
      jobId: job.jobId,
      revision,
      finalStage: job.stage,
      failureCategory: job.failure?.category,
      waveformViewed,
    },
    timestamp: now.toISOString(),
  };
}

/** Where results are posted: the embedding frame, else the opener window. */
export function resultTarget(win: Window = window): Window | undefined {
  if (win.parent && win.parent !== win) return win.parent;
  if (win.opener) return win.opener as Window;
  return undefined;
}

export function postResult(result: CompletionResult, ctx: LaunchContext, win: Window = window): boolean {
  const target = resultTarget(win);
  if (!target) return false;
  const msg: LaunchMessage = { type: 'p6b.result', result };
  target.postMessage(msg, ctx.returnOrigin ?? win.location.origin);
  return true;
}
