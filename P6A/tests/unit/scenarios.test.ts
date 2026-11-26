/**
 * IT-LSP-01 at fixture level (P6-AC1.2, P6A-FR-4): every approved scenario
 * produces exactly its approved response from the language-service simulator.
 */
import { describe, expect, it } from 'vitest';
import { analyzeWorkspace } from '../../src/languageService/analyzer';
import { complete, hover } from '../../src/languageService/completion';
import { SCENARIOS, applyScenario, scenarioCursor } from '../../src/languageService/scenarios';
import { referenceFiles } from '../../src/files/referenceFiles';

const reference = () => Object.fromEntries(referenceFiles().map((f) => [f.path, f.content]));

function run(contents: Record<string, string>) {
  const files = Object.entries(contents).map(([path, content]) => ({ path, content }));
  return { ws: analyzeWorkspace(files), map: new Map(Object.entries(contents)) };
}

describe('approved scenarios', () => {
  it('ids are unique and cover all three kinds', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    expect(new Set(SCENARIOS.map((s) => s.kind))).toEqual(new Set(['diagnostics', 'completion', 'hover']));
  });

  for (const s of SCENARIOS) {
    it(`${s.id} ${s.title}`, () => {
      const contents = applyScenario(reference(), s);
      const { ws, map } = run(contents);

      if (s.kind === 'diagnostics') {
        const actual = [...ws.files.values()].flatMap((f) =>
          f.diagnostics.map((d) => ({
            path: f.path,
            line: d.range.start.line + 1,
            severity: d.severity === 1 ? 'error' : 'warning',
            message: d.message,
          })),
        );
        expect(actual).toEqual(s.expectedDiagnostics);
      }

      if (s.kind === 'completion') {
        const cur = scenarioCursor(contents, s)!;
        const labels = complete(ws, map, cur.path, cur).map((c) => c.label);
        for (const l of s.expectedCompletions ?? []) expect(labels).toContain(l);
        for (const l of s.unexpectedCompletions ?? []) expect(labels).not.toContain(l);
      }

      if (s.kind === 'hover') {
        const cur = scenarioCursor(contents, s)!;
        const h = hover(ws, map, cur.path, cur);
        expect(h?.contents.value ?? '').toContain(s.expectedHover);
      }
    });
  }

  it('applyScenario does not change the input and rejects a missing anchor', () => {
    const ref = reference();
    applyScenario(ref, SCENARIOS[1]);
    expect(ref).toEqual(reference());
    expect(() => applyScenario(ref, { ...SCENARIOS[1], edits: [{ path: 'src/counter.vhd', find: 'not here', replace: '' }] })).toThrow();
  });
});
