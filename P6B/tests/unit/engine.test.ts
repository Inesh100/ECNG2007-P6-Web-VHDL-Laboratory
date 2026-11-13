// UT-SIM: parent-project service simulator engine (test double for Project 5).
import { describe, expect, it } from 'vitest';
import { analyse, elaborate, parseTimeNs, runJob, stripCommentsAndStrings } from '../../src/simulator/engine';
import { HDL_CASES } from '../../src/simulator/fixtures';
import { COUNTER_VHD, referenceFiles, TB_COUNTER_VHD } from '../../src/simulator/referenceFiles';
import { toBinary, writeVcd } from '../../src/simulator/vcd';
import type { JobRequest } from '../../src/contracts/hdlService';

const req = (over: Partial<JobRequest> = {}): JobRequest => ({
  contractVersion: '1.0',
  sessionId: 's',
  revision: 1,
  top: 'tb_counter',
  files: referenceFiles(),
  options: { vhdlStandard: '08', stopTime: '250ns', waveform: 'vcd' },
  ...over,
});

describe('UT-SIM-01 time parsing', () => {
  it('converts VHDL time literals to ns', () => {
    expect(parseTimeNs('250ns')).toBe(250);
    expect(parseTimeNs('1 us')).toBe(1000);
    expect(parseTimeNs('5ms')).toBe(5_000_000);
    expect(parseTimeNs('10 ps')).toBeCloseTo(0.01);
    expect(parseTimeNs('soon')).toBeUndefined();
  });
});

describe('UT-SIM-02 comment/string stripping keeps positions', () => {
  it('blanks comments and strings but not code', () => {
    const out = stripCommentsAndStrings('a <= b; -- c; d\nreport "x;y";');
    expect(out.split('\n')[0]).toBe('a <= b;' + ' '.repeat(8));
    expect(out.split('\n')[1]).not.toContain('x;y');
    expect(out.length).toBe('a <= b; -- c; d\nreport "x;y";'.length);
  });
});

describe('UT-SIM-03 analysis checks', () => {
  it('accepts the reference files', () => {
    expect(analyse(referenceFiles())).toEqual([]);
  });
  it('reports a missing semicolon with file and line', () => {
    const files = [{ path: 'src/counter.vhd', role: 'design' as const, content: COUNTER_VHD.replace('count_r <= count_r + 1;', 'count_r <= count_r + 1') }];
    const d = analyse(files);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ file: 'src/counter.vhd', line: 27, severity: 'error' });
  });
  it('reports a missing end if', () => {
    const files = [{ path: 'src/counter.vhd', role: 'design' as const, content: COUNTER_VHD.replace('      end if;\n    end if;', '    end if;') }];
    expect(analyse(files).some((x) => x.message.includes("'end if'"))).toBe(true);
  });
  it('reports unbalanced parentheses', () => {
    const files = [{ path: 'src/counter.vhd', role: 'design' as const, content: COUNTER_VHD.replace('process (clk)', 'process (clk') }];
    expect(analyse(files).some((x) => x.message.includes(')'))).toBe(true);
  });
  it('reports an unknown work entity', () => {
    const files = [...referenceFiles().slice(0, 1), { path: 'tb/tb_counter.vhd', role: 'testbench' as const, content: TB_COUNTER_VHD.replace('work.counter', 'work.nothing') }];
    expect(analyse(files)[0].message).toContain('"nothing" not found');
  });
});

describe('UT-SIM-04 elaboration checks', () => {
  it('fails when the top unit is missing', () => {
    expect(elaborate(req({ top: 'tb_missing' })).diags[0].message).toContain('cannot find entity');
  });
  it('fails on generic/port width mismatch', () => {
    const files = [referenceFiles()[0], { ...referenceFiles()[1], content: TB_COUNTER_VHD.replace('WIDTH => 4', 'WIDTH => 6') }];
    expect(elaborate(req({ files })).diags[0].message).toContain('does not match');
  });
  it('builds a model for the reference', () => {
    expect(elaborate(req()).model).toEqual({ width: 4, tbCountWidth: 4, clkPeriodNs: 10 });
  });
});

describe('UT-SIM-05 simulation and VCD', () => {
  it('produces a VCD in which count wraps to 0 after 16 enabled edges', () => {
    const out = runJob(req());
    expect(out.result.status).toBe('succeeded');
    const vcd = out.result.artefacts[0].content!;
    expect(vcd).toContain('$var wire 4 q count [3:0] $end');
    expect(vcd).toContain('#165\n1c\nb1111 q');
    expect(vcd).toContain('#175\n1c\nb0000 q');
    expect(out.result.result?.reports?.[0].message).toBe('tb_counter finished');
  });
  it('reflects edits: a 20 ns clock period changes edge times', () => {
    const tb = TB_COUNTER_VHD.replace('CLK_PERIOD : time := 10 ns', 'CLK_PERIOD : time := 20 ns');
    const out = runJob(req({ files: [referenceFiles()[0], { ...referenceFiles()[1], content: tb }], options: { vhdlStandard: '08', stopTime: '500ns', waveform: 'vcd' } }));
    expect(out.result.artefacts[0].content).toContain('#10\n1c');
  });
  it('omits the artefact when no waveform is requested', () => {
    expect(runJob(req({ options: { vhdlStandard: '08', stopTime: '250ns', waveform: 'none' } })).result.artefacts).toEqual([]);
  });
  it('writes binary vectors with padding', () => {
    expect(toBinary(5, 4)).toBe('0101');
    expect(toBinary(16, 4)).toBe('0000');
    const v = writeVcd({ date: 'd', timescale: '1ns', signals: [{ id: 'a', name: 'a', width: 1, scope: 't' }], initial: { a: 0 }, changes: [{ time: 5, id: 'a', value: 1 }], endTime: 10 });
    expect(v).toMatch(/#5\n1a\n#10\n$/);
  });
});

describe('UT-SIM-06 service checks', () => {
  it('rejects runaway stop times as service failures', () => {
    const r = runJob(req({ options: { vhdlStandard: '08', stopTime: '2ms', waveform: 'vcd' } })).result;
    expect(r.failure?.category).toBe('service');
  });
  it('rejects an unsupported contract version', () => {
    expect(runJob(req({ contractVersion: '0.9' })).result.failure?.category).toBe('service');
  });
});

describe('UT-SIM-07 every published HDL case gives its expected outcome', () => {
  it.each(HDL_CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const r = runJob(req({ files: c.files, top: c.top, options: c.options })).result;
    expect(r.status).toBe(c.expected.status);
    expect(r.failure?.category).toBe(c.expected.category);
    expect(r.artefacts.length > 0).toBe(c.expected.waveform);
  });
});
