// UT-LTR: learning-tool launch/result hook.
import { describe, expect, it, vi } from 'vitest';
import type { JobResult } from '../../src/contracts/hdlService';
import type { LaunchContext } from '../../src/contracts/launchResult';
import { LAUNCH_EXAMPLES } from '../../src/launch/examples';
import { buildCompletionResult, decodeLaunch, encodeLaunch, parseLaunchParam, postResult } from '../../src/launch/launch';

const ctx = LAUNCH_EXAMPLES[0].context as LaunchContext;
const job = (status: JobResult['status']): JobResult => ({
  contractVersion: '1.0',
  jobId: 'job-1',
  status,
  stage: status === 'succeeded' ? 'completed' : 'analysis',
  failure: status === 'failed' ? { category: 'analysis', message: 'x', diagnostics: [] } : undefined,
  logs: [],
  artefacts: [],
});

describe('UT-LTR-01 launch parameter encoding', () => {
  it('round-trips through base64url, including non-ASCII', () => {
    const c = { ...ctx, learnerId: 'élève-✓' };
    const enc = encodeLaunch(c);
    expect(enc).not.toMatch(/[+/=]/);
    expect(decodeLaunch(enc)).toEqual(c);
  });
  it('parses a valid launch from the query string', () => {
    expect(parseLaunchParam(`?launch=${encodeLaunch(ctx)}`)).toEqual({ context: ctx, errors: [] });
  });
  it('reports invalid launches instead of accepting them', () => {
    expect(parseLaunchParam('?launch=%%%')?.errors[0]).toContain('base64url');
    expect(parseLaunchParam(`?launch=${encodeLaunch(LAUNCH_EXAMPLES[3].context as LaunchContext)}`)?.errors).toContain('targetType must be "web-vhdl-lab"');
    expect(parseLaunchParam('?case=HDL-01')).toBeUndefined();
  });
});

describe('UT-LTR-02 completion rules (P6B-FR-16)', () => {
  it('successful-run: completed with score 1 on success, incomplete with 0 on failure', () => {
    expect(buildCompletionResult(ctx, job('succeeded'), 3, false)).toMatchObject({ status: 'completed', scoreGiven: 1, launchId: ctx.launchId, evidence: { jobId: 'job-1', revision: 3 } });
    expect(buildCompletionResult(ctx, job('failed'), 3, false)).toMatchObject({ status: 'incomplete', scoreGiven: 0, evidence: { failureCategory: 'analysis' } });
  });
  it('waveform-viewed: needs success and a viewed waveform', () => {
    const c = LAUNCH_EXAMPLES[2].context as LaunchContext;
    expect(buildCompletionResult(c, job('succeeded'), 1, false).status).toBe('incomplete');
    expect(buildCompletionResult(c, job('succeeded'), 1, true).status).toBe('completed');
  });
});

describe('UT-LTR-03 postResult', () => {
  it('posts to the parent frame using the return origin', () => {
    const parent = { postMessage: vi.fn() };
    const win = { parent, opener: null, location: { origin: 'https://lab.example' } } as unknown as Window;
    const result = buildCompletionResult({ ...ctx, returnOrigin: 'https://lms.example' }, job('succeeded'), 1, false);
    expect(postResult(result, { ...ctx, returnOrigin: 'https://lms.example' }, win)).toBe(true);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'p6b.result', result }, 'https://lms.example');
  });
  it('returns false when there is no host window', () => {
    const win = { opener: null, location: { origin: 'x' } } as unknown as Window;
    (win as unknown as { parent: Window }).parent = win;
    expect(postResult(buildCompletionResult(ctx, job('succeeded'), 1, false), ctx, win)).toBe(false);
  });
});
