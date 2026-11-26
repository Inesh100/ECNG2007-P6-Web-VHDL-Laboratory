/**
 * Problems list model (the VS Code "PROBLEMS" panel). Pure, so it is testable.
 */
export type ProblemSeverity = 'error' | 'warning' | 'info';

export interface ProblemItem {
  path: string;
  /** 1-based, as shown in the editor. */
  line: number;
  column: number;
  severity: ProblemSeverity;
  message: string;
  code?: string;
  source?: string;
}

/** Monaco MarkerSeverity values. */
export const MARKER_SEVERITY = { Hint: 1, Info: 2, Warning: 4, Error: 8 } as const;

export function severityFromMarker(sev: number): ProblemSeverity {
  if (sev >= MARKER_SEVERITY.Error) return 'error';
  if (sev >= MARKER_SEVERITY.Warning) return 'warning';
  return 'info';
}

export function summarize(items: ProblemItem[]): { errors: number; warnings: number } {
  return {
    errors: items.filter((i) => i.severity === 'error').length,
    warnings: items.filter((i) => i.severity === 'warning').length,
  };
}

const RANK: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Order like VS Code: by file (in the given file order), then line, column. */
export function sortProblems(items: ProblemItem[], fileOrder: string[]): ProblemItem[] {
  const idx = (p: string) => {
    const i = fileOrder.indexOf(p);
    return i < 0 ? fileOrder.length : i;
  };
  return [...items].sort(
    (a, b) => idx(a.path) - idx(b.path) || a.line - b.line || a.column - b.column || RANK[a.severity] - RANK[b.severity],
  );
}
