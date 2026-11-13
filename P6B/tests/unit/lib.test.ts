// UT-LIB: VCD reader for the built-in waveform view, and VHDL display helpers.
import { describe, expect, it } from 'vitest';
import { formatValue, parseVcd, valueAt } from '../../src/lib/vcdParser';
import { findEntities, findPorts, tokenizeLine } from '../../src/lib/vhdl';
import { runJob } from '../../src/simulator/engine';
import { referenceFiles, COUNTER_VHD } from '../../src/simulator/referenceFiles';

const vcd = runJob({ contractVersion: '1.0', sessionId: 's', revision: 1, top: 'tb_counter', files: referenceFiles(), options: { vhdlStandard: '08', stopTime: '250ns', waveform: 'vcd' } }).result.artefacts[0].content!;

describe('UT-LIB-01 parseVcd', () => {
  const wave = parseVcd(vcd);
  it('reads timescale, end time and all five signals with their scopes', () => {
    expect(wave.timescale).toBe('1ns');
    expect(wave.endTime).toBe(250);
    expect(wave.signals.map((s) => `${s.scope}.${s.name}`)).toEqual(['tb_counter.clk', 'tb_counter.rst', 'tb_counter.en', 'tb_counter.count', 'tb_counter.dut.count_r']);
  });
  it('gives the value of a signal at any time', () => {
    const count = wave.signals.find((s) => s.name === 'count')!;
    expect(valueAt(count, 0)).toBe('0000');
    expect(valueAt(count, 30)).toBe('0001');
    expect(valueAt(count, 170)).toBe('1111');
    expect(valueAt(count, 200)).toBe('0000');
  });
  it('formats vectors as decimal and keeps single bits', () => {
    expect(formatValue('1111', 4)).toBe('15');
    expect(formatValue('1', 1)).toBe('1');
    expect(formatValue('1x01', 4)).toBe('1x01');
  });
});

describe('UT-LIB-02 VHDL display helpers', () => {
  it('colours keywords, types, strings, characters, numbers and comments', () => {
    const kinds = tokenizeLine("  signal a : std_logic := '0'; -- note").filter((t) => t.kind !== 'plain').map((t) => t.kind);
    expect(kinds).toEqual(['keyword', 'type', 'char', 'comment']);
    expect(tokenizeLine('report "done" severity note;').map((t) => t.kind)).toContain('string');
  });
  it('finds entities and ports for the Properties panel', () => {
    expect(findEntities(referenceFiles().map((f) => f.content).join('\n'))).toEqual(['counter', 'tb_counter']);
    expect(findPorts(COUNTER_VHD)).toEqual([
      { name: 'clk', direction: 'in', type: 'std_logic' },
      { name: 'rst', direction: 'in', type: 'std_logic' },
      { name: 'en', direction: 'in', type: 'std_logic' },
      { name: 'count', direction: 'out', type: 'std_logic_vector(WIDTH - 1 downto 0)' },
    ]);
  });
});
