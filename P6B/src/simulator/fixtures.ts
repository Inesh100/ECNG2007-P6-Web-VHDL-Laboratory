/**
 * Published HDL job scenarios used for P6B system and contract tests.
 *
 * Stand-ins for the staff "HDL job success/failure cases" (P6B-AD-01). Each
 * case is a workspace state + options and the outcome the contract expects.
 * When staff release the official cases they replace this list (CR-P6B-02).
 */
import type { FailureCategory, JobOptions } from '../contracts/hdlService';
import type { WorkspaceFile } from '../workspace/types';
import { COUNTER_VHD, referenceFiles, REFERENCE_TOP, TB_COUNTER_VHD } from './referenceFiles';

export const DEFAULT_OPTIONS: JobOptions = { vhdlStandard: '08', stopTime: '250ns', waveform: 'vcd' };

export interface HdlCase {
  id: string;
  title: string;
  description: string;
  files: WorkspaceFile[];
  top: string;
  options: JobOptions;
  expected: { status: 'succeeded' | 'failed'; category?: FailureCategory; waveform: boolean };
}

const withDesign = (content: string): WorkspaceFile[] => [
  { path: 'src/counter.vhd', role: 'design', content },
  { path: 'tb/tb_counter.vhd', role: 'testbench', content: TB_COUNTER_VHD },
];
const withTb = (content: string): WorkspaceFile[] => [
  { path: 'src/counter.vhd', role: 'design', content: COUNTER_VHD },
  { path: 'tb/tb_counter.vhd', role: 'testbench', content },
];

export const HDL_CASES: HdlCase[] = [
  {
    id: 'HDL-01',
    title: 'Reference design - success',
    description: 'Unmodified reference counter and testbench. Expect success and the reference VCD waveform.',
    files: referenceFiles(),
    top: REFERENCE_TOP,
    options: DEFAULT_OPTIONS,
    expected: { status: 'succeeded', waveform: true },
  },
  {
    id: 'HDL-02',
    title: 'Missing semicolon - analysis failure',
    description: "The ';' after the counter increment is removed. GHDL analysis must reject the design.",
    files: withDesign(COUNTER_VHD.replace('count_r <= count_r + 1;', 'count_r <= count_r + 1')),
    top: REFERENCE_TOP,
    options: DEFAULT_OPTIONS,
    expected: { status: 'failed', category: 'analysis', waveform: false },
  },
  {
    id: 'HDL-03',
    title: 'Unknown entity - analysis failure',
    description: 'The testbench instantiates work.countr, which does not exist.',
    files: withTb(TB_COUNTER_VHD.replace('entity work.counter', 'entity work.countr')),
    top: REFERENCE_TOP,
    options: DEFAULT_OPTIONS,
    expected: { status: 'failed', category: 'analysis', waveform: false },
  },
  {
    id: 'HDL-04',
    title: 'Port width mismatch - elaboration failure',
    description: 'The testbench maps WIDTH => 8 onto a 4-bit count signal. Analysis passes; elaboration fails.',
    files: withTb(TB_COUNTER_VHD.replace('generic map (WIDTH => 4)', 'generic map (WIDTH => 8)')),
    top: REFERENCE_TOP,
    options: DEFAULT_OPTIONS,
    expected: { status: 'failed', category: 'elaboration', waveform: false },
  },
  {
    id: 'HDL-05',
    title: 'Wrong top-level - elaboration failure',
    description: 'The job asks for top unit tb_count, which no file declares.',
    files: referenceFiles(),
    top: 'tb_count',
    options: DEFAULT_OPTIONS,
    expected: { status: 'failed', category: 'elaboration', waveform: false },
  },
  {
    id: 'HDL-06',
    title: 'Failing assertion - simulation failure',
    description: 'The self-check expects 5 with severity failure, so simulation stops at 200 ns.',
    files: withTb(
      TB_COUNTER_VHD.replace('assert unsigned(count) = 0', 'assert unsigned(count) = 5')
        .replace('"counter did not wrap to zero" severity error', '"counter did not reach 5" severity failure'),
    ),
    top: REFERENCE_TOP,
    options: DEFAULT_OPTIONS,
    expected: { status: 'failed', category: 'simulation', waveform: false },
  },
  {
    id: 'HDL-07',
    title: 'Runaway job - service/runtime failure',
    description: 'Requests 5 ms of simulated time, above the 1 ms service limit. The service terminates the job.',
    files: referenceFiles(),
    top: REFERENCE_TOP,
    options: { ...DEFAULT_OPTIONS, stopTime: '5ms' },
    expected: { status: 'failed', category: 'service', waveform: false },
  },
  {
    id: 'HDL-08',
    title: 'Success without waveform',
    description: 'A successful job that does not request a VCD. The waveform view must stay disabled.',
    files: referenceFiles(),
    top: REFERENCE_TOP,
    options: { ...DEFAULT_OPTIONS, waveform: 'none' },
    expected: { status: 'succeeded', waveform: false },
  },
];
