/**
 * UT-LS-07..09: completion and hover.
 */
import { describe, expect, it } from 'vitest';
import { analyzeWorkspace } from '../../src/languageService/analyzer';
import { CompletionKind, complete, hover } from '../../src/languageService/completion';
import { COUNTER_PATH, TB_COUNTER_PATH, referenceFiles } from '../../src/files/referenceFiles';

const files = referenceFiles();
const ws = analyzeWorkspace(files);
const contents = new Map(files.map((f) => [f.path, f.content]));

describe('completion', () => {
  it('UT-LS-07 ranks local declarations before library names and keywords', () => {
    const items = complete(ws, contents, COUNTER_PATH, { line: 31, character: 2 });
    const sig = items.find((i) => i.label === 'count_r')!;
    const kw = items.find((i) => i.label === 'signal')!;
    expect(sig.kind).toBe(CompletionKind.Variable);
    expect(sig.detail).toBe('signal count_r : unsigned(WIDTH - 1 downto 0)');
    expect(kw.kind).toBe(CompletionKind.Keyword);
    expect(sig.sortText! < kw.sortText!).toBe(true);
    expect(new Set(items.map((i) => i.label.toLowerCase())).size).toBe(items.length);
  });

  it('UT-LS-08 offers snippets with snippet insert format', () => {
    const items = complete(ws, contents, COUNTER_PATH, { line: 31, character: 2 });
    const proc = items.find((i) => i.label === 'process (clk)')!;
    expect(proc.kind).toBe(CompletionKind.Snippet);
    expect(proc.insertTextFormat).toBe(2);
  });

  it("offers 'all' after a package name", () => {
    const c = new Map(contents);
    c.set(COUNTER_PATH, contents.get(COUNTER_PATH)!.replace('use ieee.numeric_std.all;', 'use ieee.numeric_std.'));
    const items = complete(ws, c, COUNTER_PATH, { line: 3, character: 'use ieee.numeric_std.'.length });
    expect(items.map((i) => i.label)).toEqual(['all']);
  });

  it('in the testbench, local signals come first', () => {
    const items = complete(ws, contents, TB_COUNTER_PATH, { line: 20, character: 2 });
    expect(items.slice(0, 10).map((i) => i.label)).toContain('CLK_PERIOD');
  });
});

describe('hover', () => {
  it('UT-LS-09 shows the declaration of a port seen from the architecture', () => {
    // "  count <= std_logic_vector(count_r);" line 32 (index 31), on "count"
    const h = hover(ws, contents, COUNTER_PATH, { line: 31, character: 3 })!;
    expect(h.contents.value).toContain('port count : out std_logic_vector(WIDTH - 1 downto 0)');
    expect(h.range).toEqual({ start: { line: 31, character: 2 }, end: { line: 31, character: 7 } });
  });

  it('explains library names and keywords', () => {
    const line23 = contents.get(COUNTER_PATH)!.split('\n')[22];
    const h = hover(ws, contents, COUNTER_PATH, { line: 22, character: line23.indexOf('rising_edge') + 2 })!;
    expect(h.contents.value).toContain('rising_edge');
    expect(hover(ws, contents, COUNTER_PATH, { line: 0, character: 5 })).toBeNull(); // comment line
  });
});
