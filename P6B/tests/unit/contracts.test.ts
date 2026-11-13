// UT-CON: contract validators for HDL Service Contract v1 and Launch/Result Contract v1.
import { describe, expect, it } from 'vitest';
import { validateJobResult } from '../../src/contracts/hdlService';
import { validateCompletionResult, validateLaunchContext } from '../../src/contracts/launchResult';
import { LAUNCH_EXAMPLES } from '../../src/launch/examples';

describe('UT-CON-01 validateJobResult', () => {
  const ok = { contractVersion: '1.0', jobId: 'j', status: 'succeeded', stage: 'completed', logs: [], artefacts: [] };
  it('accepts a well-formed result', () => expect(validateJobResult(ok)).toEqual([]));
  it('rejects unknown status and stage', () => {
    expect(validateJobResult({ ...ok, status: 'DONE', stage: 42 })).toHaveLength(2);
  });
  it('requires a known failure category on failed jobs', () => {
    expect(validateJobResult({ ...ok, status: 'failed' })).toContain('failed job has no failure block');
    expect(validateJobResult({ ...ok, status: 'failed', failure: { category: 'linking', message: '', diagnostics: [] } })[0]).toContain('unknown failure category');
  });
  it('rejects non-objects', () => expect(validateJobResult(null)).toEqual(['response is not an object']));
});

describe('UT-CON-02 validateLaunchContext', () => {
  it('accepts the valid published examples and rejects the invalid one', () => {
    for (const ex of LAUNCH_EXAMPLES) expect(validateLaunchContext(ex.context).length === 0).toBe(ex.expected.accepted);
  });
  it('lists missing fields', () => {
    expect(validateLaunchContext({ contractVersion: '1.0' })).toEqual(expect.arrayContaining(['launchId missing', 'completion.rule invalid']));
  });
});

describe('UT-CON-03 validateCompletionResult', () => {
  const ok = { contractVersion: '1.0', launchId: 'l', activityId: 'a', learnerId: 'u', status: 'completed', scoreGiven: 1, scoreMaximum: 1, evidence: { jobId: 'j' }, timestamp: 't' };
  it('accepts a valid result', () => expect(validateCompletionResult(ok)).toEqual([]));
  it('rejects out-of-range scores and bad status', () => {
    expect(validateCompletionResult({ ...ok, scoreGiven: 2, status: 'done' })).toHaveLength(2);
  });
});
