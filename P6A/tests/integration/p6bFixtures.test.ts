/**
 * Editor and run agree (P6-StR4.1): for every published P6B HDL case, the P6A
 * editor shows errors exactly when P6B's run fails at ANALYSIS. Elaboration,
 * simulation and service failures are run-time problems and must not show as
 * editor errors.
 *
 * P6B's fixtures are imported read-only; no P6B code is changed or shipped.
 */
import { describe, expect, it } from 'vitest';
import { analyzeWorkspace } from '../../src/languageService/analyzer';
import { HDL_CASES } from '../../../P6B/src/simulator/fixtures';

describe('P6A diagnostics vs P6B HDL-01..08', () => {
  for (const c of HDL_CASES) {
    it(`${c.id} ${c.title}`, () => {
      const ws = analyzeWorkspace(c.files);
      const errors = [...ws.files.values()].flatMap((f) => f.diagnostics.filter((d) => d.severity === 1));
      expect(errors.length > 0).toBe(c.expected.category === 'analysis');
    });
  }

  it("HDL-02: the editor names the same problem as the run (\"';' is expected here\")", () => {
    const c = HDL_CASES.find((x) => x.id === 'HDL-02')!;
    const msgs = [...analyzeWorkspace(c.files).files.values()].flatMap((f) => f.diagnostics.map((d) => d.message));
    expect(msgs).toEqual(["';' is expected here"]);
  });
});
