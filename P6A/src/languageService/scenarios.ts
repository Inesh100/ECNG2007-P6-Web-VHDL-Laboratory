/**
 * Approved diagnostic / completion / hover scenarios (P6-StR1.2, P6-AC1.2,
 * P6A-FR-4, IT-LSP-01).
 *
 * STAND-INS: the staff-supplied scenario set has not been released yet
 * (P6A-AD-02). These are the P6A working copies, written against the reference
 * files in src/files/referenceFiles.ts. When the staff set arrives, replace the
 * entries here and in docs/language-service-scenarios.md through a CR; the
 * automated test (tests/unit/scenarios.test.ts) then checks the new set.
 *
 * Each scenario is a small text edit applied to the unmodified reference
 * files, plus the exact response the editor must display.
 */
import { COUNTER_PATH, TB_COUNTER_PATH } from '../files/referenceFiles';

export type ScenarioKind = 'diagnostics' | 'completion' | 'hover';

export interface ScenarioEdit {
  path: string;
  /** Exact text to find (first occurrence) ... */
  find: string;
  /** ... and the text that replaces it. */
  replace: string;
}

export interface ExpectedDiagnostic {
  path: string;
  /** 1-based line, as shown in the editor gutter. */
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface ScenarioCursor {
  path: string;
  /** Place the cursor just after the first occurrence of this text in the (edited) file. */
  after: string;
}

export interface Scenario {
  id: string;
  title: string;
  kind: ScenarioKind;
  edits: ScenarioEdit[];
  /** Diagnostics scenarios: the complete expected set across both files. */
  expectedDiagnostics?: ExpectedDiagnostic[];
  cursor?: ScenarioCursor;
  /** Completion scenarios: labels that must be offered. */
  expectedCompletions?: string[];
  /** Completion scenarios: labels that must NOT be offered. */
  unexpectedCompletions?: string[];
  /** Hover scenarios: text the hover must contain. */
  expectedHover?: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'LSP-01',
    title: 'Unmodified reference files: no problems',
    kind: 'diagnostics',
    edits: [],
    expectedDiagnostics: [],
  },
  {
    id: 'LSP-02',
    title: "Missing ';' after the output assignment",
    kind: 'diagnostics',
    edits: [{ path: COUNTER_PATH, find: 'count <= std_logic_vector(count_r);', replace: 'count <= std_logic_vector(count_r)' }],
    expectedDiagnostics: [{ path: COUNTER_PATH, line: 32, severity: 'error', message: "';' is expected here" }],
  },
  {
    id: 'LSP-03',
    title: 'Assignment to an undeclared signal',
    kind: 'diagnostics',
    edits: [{ path: COUNTER_PATH, find: 'count_r <= count_r + 1;', replace: 'cnt_r <= count_r + 1;' }],
    expectedDiagnostics: [{ path: COUNTER_PATH, line: 27, severity: 'error', message: 'no declaration for "cnt_r"' }],
  },
  {
    id: 'LSP-04',
    title: 'Architecture closed with the wrong name',
    kind: 'diagnostics',
    edits: [{ path: COUNTER_PATH, find: 'end architecture rtl;', replace: 'end architecture behav;' }],
    expectedDiagnostics: [{ path: COUNTER_PATH, line: 33, severity: 'error', message: 'misspelling, "rtl" expected' }],
  },
  {
    id: 'LSP-05',
    title: "Missing 'end if'",
    kind: 'diagnostics',
    edits: [{ path: COUNTER_PATH, find: '      end if;\n    end if;', replace: '    end if;' }],
    expectedDiagnostics: [{ path: COUNTER_PATH, line: 29, severity: 'error', message: "'end if' is expected" }],
  },
  {
    id: 'LSP-06',
    title: 'Testbench instantiates an entity that does not exist',
    kind: 'diagnostics',
    edits: [{ path: TB_COUNTER_PATH, find: 'entity work.counter', replace: 'entity work.count' }],
    expectedDiagnostics: [{ path: TB_COUNTER_PATH, line: 16, severity: 'error', message: 'unit "count" not found in library "work"' }],
  },
  {
    id: 'LSP-07',
    title: 'Signal declared but never used (warning)',
    kind: 'diagnostics',
    edits: [
      {
        path: COUNTER_PATH,
        find: "  signal count_r : unsigned(WIDTH - 1 downto 0) := (others => '0');",
        replace: "  signal count_r : unsigned(WIDTH - 1 downto 0) := (others => '0');\n  signal spare   : std_logic;",
      },
    ],
    expectedDiagnostics: [{ path: COUNTER_PATH, line: 20, severity: 'warning', message: 'signal "spare" is declared but never used' }],
  },
  {
    id: 'LSP-08',
    title: "Unclosed '(' in the output assignment",
    kind: 'diagnostics',
    edits: [{ path: COUNTER_PATH, find: 'count <= std_logic_vector(count_r);', replace: 'count <= std_logic_vector(count_r;' }],
    expectedDiagnostics: [{ path: COUNTER_PATH, line: 32, severity: 'error', message: "')' is expected to close this '('" }],
  },
  {
    id: 'LSP-09',
    title: "Completion after 'entity work.' lists the workspace entities",
    kind: 'completion',
    edits: [{ path: TB_COUNTER_PATH, find: 'entity work.counter', replace: 'entity work.' }],
    cursor: { path: TB_COUNTER_PATH, after: 'entity work.' },
    expectedCompletions: ['counter', 'tb_counter'],
    unexpectedCompletions: ['signal', 'std_logic'],
  },
  {
    id: 'LSP-10',
    title: 'Completion inside the architecture offers signals, ports and generics',
    kind: 'completion',
    edits: [{ path: COUNTER_PATH, find: '  count <= std_logic_vector(count_r);', replace: '  count <= std_logic_vector(count_r);\n  cou' }],
    cursor: { path: COUNTER_PATH, after: '\n  cou' },
    expectedCompletions: ['count_r', 'count', 'clk', 'rst', 'en', 'WIDTH', 'rising_edge', 'std_logic_vector', 'process'],
  },
  {
    id: 'LSP-11',
    title: "Completion after 'use ieee.' lists the IEEE packages",
    kind: 'completion',
    edits: [{ path: COUNTER_PATH, find: 'use ieee.numeric_std.all;', replace: 'use ieee.' }],
    cursor: { path: COUNTER_PATH, after: 'use ieee.' },
    expectedCompletions: ['std_logic_1164', 'numeric_std'],
    unexpectedCompletions: ['count_r'],
  },
  {
    id: 'LSP-12',
    title: 'Hover on a signal shows its declaration',
    kind: 'hover',
    edits: [],
    cursor: { path: COUNTER_PATH, after: 'count <= std_logic_vector(count_' },
    expectedHover: 'signal count_r : unsigned(WIDTH - 1 downto 0)',
  },
];

/** Applies a scenario's edits to a set of file contents (path -> text). */
export function applyScenario(contents: Record<string, string>, scenario: Scenario): Record<string, string> {
  const out = { ...contents };
  for (const e of scenario.edits) {
    const text = out[e.path];
    if (text === undefined) throw new Error(`${scenario.id}: unknown file ${e.path}`);
    const at = text.indexOf(e.find);
    if (at < 0) throw new Error(`${scenario.id}: text not found in ${e.path}: ${JSON.stringify(e.find)}`);
    out[e.path] = text.slice(0, at) + e.replace + text.slice(at + e.find.length);
  }
  return out;
}

/** Zero-based cursor position for a scenario, after its edits. */
export function scenarioCursor(contents: Record<string, string>, scenario: Scenario): { path: string; line: number; character: number } | undefined {
  const c = scenario.cursor;
  if (!c) return undefined;
  const text = contents[c.path];
  const at = text?.indexOf(c.after) ?? -1;
  if (at < 0) throw new Error(`${scenario.id}: cursor anchor not found in ${c.path}`);
  const upTo = text.slice(0, at + c.after.length);
  const lines = upTo.split('\n');
  return { path: c.path, line: lines.length - 1, character: lines[lines.length - 1].length };
}

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
