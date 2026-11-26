/**
 * UT-LS-01..06: diagnostics engine of the P6A language-service simulator.
 */
import { describe, expect, it } from 'vitest';
import { analyzeWorkspace, joinTokens, visibleDeclarations } from '../../src/languageService/analyzer';
import { lex } from '../../src/languageService/lexer';
import { COUNTER_PATH, COUNTER_VHD, TB_COUNTER_PATH, TB_COUNTER_VHD, referenceFiles } from '../../src/files/referenceFiles';

const analyze = (counter = COUNTER_VHD, tb = TB_COUNTER_VHD) =>
  analyzeWorkspace([
    { path: COUNTER_PATH, content: counter },
    { path: TB_COUNTER_PATH, content: tb },
  ]);

const messages = (counter: string, tb = TB_COUNTER_VHD, path = COUNTER_PATH) =>
  analyze(counter, tb).files.get(path)!.diagnostics.map((d) => `${d.range.start.line + 1}: ${d.message}`);

describe('lexer', () => {
  it('drops comments and keeps zero-based positions', () => {
    const { tokens } = lex('  signal a : bit; -- note\n/* block\ncomment */ b <= x"0F";');
    expect(tokens.map((t) => t.text)).toEqual(['signal', 'a', ':', 'bit', ';', 'b', '<=', 'x"0F"', ';']);
    expect(tokens[0]).toMatchObject({ line: 0, col: 2, end: 8, kind: 'keyword' });
    expect(tokens[5]).toMatchObject({ line: 2, col: 11, kind: 'id' });
    expect(tokens[7].kind).toBe('bitstring');
  });

  it("tells character literals from attribute ticks", () => {
    const { tokens } = lex("if clk'event and clk = '1' then");
    expect(tokens.filter((t) => t.kind === 'char').map((t) => t.text)).toEqual(["'1'"]);
    expect(tokens.find((t) => t.text === "'")).toBeDefined();
  });

  it('reports an unterminated string', () => {
    expect(lex('report "oops;').problems[0].message).toBe('unterminated string literal');
  });
});

describe('reference files (UT-LS-01)', () => {
  it('produce no diagnostics at all', () => {
    const ws = analyze();
    expect(ws.files.get(COUNTER_PATH)!.diagnostics).toEqual([]);
    expect(ws.files.get(TB_COUNTER_PATH)!.diagnostics).toEqual([]);
  });

  it('the early prototype counter files are also clean', () => {
    const proto = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity counter is
    Port (
        clk   : in STD_LOGIC;
        reset : in STD_LOGIC;
        q     : out STD_LOGIC_VECTOR(3 downto 0)
    );
end counter;

architecture Behavioral of counter is
    signal count : unsigned(3 downto 0) := (others => '0');
begin
    process(clk, reset)
    begin
        if reset = '1' then
            count <= (others => '0');
        elsif rising_edge(clk) then
            count <= count + 1;
        end if;
    end process;

    q <= std_logic_vector(count);
end Behavioral;`;
    const ws = analyzeWorkspace([{ path: 'counter.vhd', content: proto }]);
    expect(ws.files.get('counter.vhd')!.diagnostics).toEqual([]);
  });

  it('collects entities, ports, generics and signals', () => {
    const ws = analyze();
    expect([...ws.entities.keys()].sort()).toEqual(['counter', 'tb_counter']);
    const names = visibleDeclarations(ws, COUNTER_PATH).map((d) => `${d.kind}:${d.name}`);
    expect(names).toContain('generic:WIDTH');
    expect(names).toContain('port:count');
    expect(names).toContain('signal:count_r');
    const sig = ws.allDeclarations.find((d) => d.name === 'count_r')!;
    expect(sig.detail).toBe('signal count_r : unsigned(WIDTH - 1 downto 0)');
    expect(sig.line).toBe(18);
  });
});

describe('checks', () => {
  it("UT-LS-02 missing ';' is reported on the line that needs it", () => {
    expect(messages(COUNTER_VHD, TB_COUNTER_VHD.replace('    wait;\n', '    wait\n'), TB_COUNTER_PATH)).toEqual(["33: ';' is expected here"]);
    expect(messages(COUNTER_VHD.replace('library ieee;', 'library ieee'))).toEqual(["2: ';' is expected here"]);
  });

  it('UT-LS-03 block structure and closing names', () => {
    expect(messages(COUNTER_VHD.replace('  end process;', '  end;'))).toEqual(["30: 'end process' is expected"]);
    expect(messages(COUNTER_VHD.replace('end entity counter;', 'end entity cnt;'))).toEqual(['16: misspelling, "counter" expected']);
    expect(messages(COUNTER_VHD + '\nend if;\n')).toEqual(["35: unexpected 'end if'"]);
  });

  it('UT-LS-04 undeclared names in assignments and sensitivity lists', () => {
    expect(messages(COUNTER_VHD.replace('process (clk)', 'process (clock)'))).toEqual(['21: no declaration for "clock"']);
    expect(messages(COUNTER_VHD.replace('count <= std_logic_vector', 'cnt <= std_logic_vector'))).toEqual(['32: no declaration for "cnt"']);
  });

  it('UT-LS-05 parentheses', () => {
    expect(messages(COUNTER_VHD.replace('rising_edge(clk)', 'rising_edge(clk))'))).toContain("23: unexpected ')'");
  });

  it('UT-LS-06 names are case-insensitive', () => {
    expect(messages(COUNTER_VHD.replace('count_r <= count_r + 1;', 'COUNT_R <= Count_R + 1;'))).toEqual([]);
  });
});

describe('joinTokens', () => {
  it('rebuilds readable type text', () => {
    expect(joinTokens(lex('std_logic_vector(WIDTH - 1 downto 0)').tokens)).toBe('std_logic_vector(WIDTH - 1 downto 0)');
  });
});

describe('referenceFiles', () => {
  it('returns copies with the IF-P6-WS-01 paths and roles', () => {
    const a = referenceFiles();
    a[0].content = 'changed';
    expect(referenceFiles()[0].content).toBe(COUNTER_VHD);
    expect(a.map((f) => `${f.path}:${f.role}`)).toEqual(['src/counter.vhd:design', 'tb/tb_counter.vhd:testbench']);
  });
});
