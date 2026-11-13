/**
 * Published launch/result examples (stand-ins for the staff examples, P6B-AD-01).
 * Used by the local harness (harness.html) and the contract tests.
 */
import type { LaunchContext } from '../contracts/launchResult';

export interface LaunchExample {
  id: string;
  title: string;
  context: LaunchContext | Record<string, unknown>;
  /** HDL case the harness asks the lab to run (see src/simulator/fixtures.ts). */
  caseId: string;
  /** Opens the waveform after the run (needed for the waveform-viewed rule). */
  viewWaveform: boolean;
  expected: { accepted: boolean; status?: 'completed' | 'incomplete'; scoreGiven?: number };
}

const base = {
  contractVersion: '1.0',
  targetType: 'web-vhdl-lab' as const,
  courseId: 'ECNG2007-2026',
  issuedAt: '2026-11-02T00:00:00.000Z',
};

export const LAUNCH_EXAMPLES: LaunchExample[] = [
  {
    id: 'LTR-01',
    title: 'Successful run completes the activity',
    context: { ...base, launchId: 'launch-0001', activityId: 'web-vhdl-lab/counter', learnerId: 'learner-a1', completion: { rule: 'successful-run' } },
    caseId: 'HDL-01',
    viewWaveform: false,
    expected: { accepted: true, status: 'completed', scoreGiven: 1 },
  },
  {
    id: 'LTR-02',
    title: 'Failed run reports incomplete',
    context: { ...base, launchId: 'launch-0002', activityId: 'web-vhdl-lab/counter', learnerId: 'learner-a2', completion: { rule: 'successful-run' } },
    caseId: 'HDL-02',
    viewWaveform: false,
    expected: { accepted: true, status: 'incomplete', scoreGiven: 0 },
  },
  {
    id: 'LTR-03',
    title: 'Waveform-viewed rule completes after the waveform opens',
    context: { ...base, launchId: 'launch-0003', activityId: 'web-vhdl-lab/counter-waveform', learnerId: 'learner-a3', completion: { rule: 'waveform-viewed' } },
    caseId: 'HDL-01',
    viewWaveform: true,
    expected: { accepted: true, status: 'completed', scoreGiven: 1 },
  },
  {
    id: 'LTR-04',
    title: 'Invalid launch (wrong target type) is rejected',
    context: { ...base, targetType: 'digital-tutor', launchId: 'launch-0004', activityId: 'tutor/and-gate', learnerId: 'learner-a4', completion: { rule: 'successful-run' } },
    caseId: 'HDL-01',
    viewWaveform: false,
    expected: { accepted: false },
  },
];
