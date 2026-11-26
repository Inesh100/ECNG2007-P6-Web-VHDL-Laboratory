/**
 * Completion and hover for the P6A language-service simulator.
 * Result shapes are structurally identical to LSP CompletionItem / Hover.
 */
import { lex } from './lexer';
import { visibleDeclarations, type Declaration, type Position, type Range, type WorkspaceAnalysis } from './analyzer';
import { HOVER_DOCS, KEYWORDS, LIBRARY_PACKAGES, STD_NAME_MAP, STD_NAMES, type StdName } from './vhdlNames';

/** LSP CompletionItemKind values used here. */
export const CompletionKind = {
  Function: 3,
  Field: 5,
  Variable: 6,
  Class: 7,
  Module: 9,
  Property: 10,
  Unit: 11,
  Value: 12,
  Enum: 13,
  Keyword: 14,
  Snippet: 15,
  EnumMember: 20,
  Constant: 21,
  Struct: 22,
  TypeParameter: 25,
} as const;

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  /** 1 = plain text, 2 = snippet */
  insertTextFormat?: 1 | 2;
  sortText?: string;
}

export interface Hover {
  contents: { kind: 'markdown'; value: string };
  range?: Range;
}

const DECL_KIND: Record<Declaration['kind'], number> = {
  entity: CompletionKind.Class,
  architecture: CompletionKind.Class,
  package: CompletionKind.Module,
  component: CompletionKind.Class,
  port: CompletionKind.Field,
  generic: CompletionKind.Constant,
  signal: CompletionKind.Variable,
  constant: CompletionKind.Constant,
  variable: CompletionKind.Variable,
  file: CompletionKind.Variable,
  alias: CompletionKind.Variable,
  type: CompletionKind.Struct,
  subtype: CompletionKind.Struct,
  enum: CompletionKind.EnumMember,
  function: CompletionKind.Function,
  procedure: CompletionKind.Function,
  parameter: CompletionKind.Variable,
  label: CompletionKind.Property,
  library: CompletionKind.Module,
  loop: CompletionKind.Variable,
};

const STD_KIND: Record<StdName['kind'], number> = {
  type: CompletionKind.TypeParameter,
  function: CompletionKind.Function,
  value: CompletionKind.Value,
  unit: CompletionKind.Unit,
  library: CompletionKind.Module,
  package: CompletionKind.Module,
  attribute: CompletionKind.Property,
};

/** VS Code-style snippets for the common VHDL constructs. */
export const SNIPPETS: CompletionItem[] = [
  {
    label: 'entity … is',
    kind: CompletionKind.Snippet,
    detail: 'entity declaration',
    insertText: 'entity ${1:name} is\n\tport (\n\t\t${2:clk} : in std_logic\n\t);\nend entity ${1:name};',
    insertTextFormat: 2,
  },
  {
    label: 'architecture … of',
    kind: CompletionKind.Snippet,
    detail: 'architecture body',
    insertText: 'architecture ${1:rtl} of ${2:entity_name} is\nbegin\n\t$0\nend architecture ${1:rtl};',
    insertTextFormat: 2,
  },
  {
    label: 'process (clk)',
    kind: CompletionKind.Snippet,
    detail: 'clocked process',
    insertText: 'process (${1:clk})\nbegin\n\tif rising_edge(${1:clk}) then\n\t\t$0\n\tend if;\nend process;',
    insertTextFormat: 2,
  },
  {
    label: 'if … then',
    kind: CompletionKind.Snippet,
    detail: 'if statement',
    insertText: 'if ${1:condition} then\n\t$0\nend if;',
    insertTextFormat: 2,
  },
  {
    label: 'case … is',
    kind: CompletionKind.Snippet,
    detail: 'case statement',
    insertText: 'case ${1:selector} is\n\twhen ${2:choice} =>\n\t\t$0\n\twhen others =>\n\t\tnull;\nend case;',
    insertTextFormat: 2,
  },
];

function lineText(content: string, line: number): string {
  return content.split(/\r?\n/)[line] ?? '';
}

export function complete(ws: WorkspaceAnalysis, contents: Map<string, string>, path: string, pos: Position): CompletionItem[] {
  const before = lineText(contents.get(path) ?? '', pos.line).slice(0, pos.character);

  // entity work.<entity>
  if (/\bwork\.\w*$/i.test(before)) {
    return [...ws.entities.values()].map((e) => ({
      label: e.name,
      kind: CompletionKind.Class,
      detail: `entity work.${e.name}`,
      documentation: `Declared in ${e.path}`,
      sortText: `0_${e.lower}`,
    }));
  }
  // use ieee.<pkg>.all / use std.<pkg>.all
  const pkgAll = /\b(ieee|std|work)\.\w+\.\w*$/i.exec(before);
  if (pkgAll) return [{ label: 'all', kind: CompletionKind.Keyword, detail: 'every declaration in the package', sortText: '0_all' }];
  const lib = /\b(ieee|std)\.\w*$/i.exec(before);
  if (lib) {
    return LIBRARY_PACKAGES[lib[1].toLowerCase()].map((p) => ({
      label: p,
      kind: CompletionKind.Module,
      detail: `package ${lib[1].toLowerCase()}.${p}`,
      sortText: `0_${p}`,
    }));
  }

  const items: CompletionItem[] = [];
  const seen = new Set<string>();
  const add = (item: CompletionItem) => {
    const key = item.label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const d of visibleDeclarations(ws, path)) {
    if (d.kind === 'library') continue;
    add({ label: d.name, kind: DECL_KIND[d.kind], detail: d.detail, documentation: `Declared in ${d.path}:${d.line + 1}`, sortText: `0_${d.lower}` });
  }
  for (const e of ws.entities.values()) {
    add({ label: e.name, kind: CompletionKind.Class, detail: `entity ${e.name}`, documentation: `Declared in ${e.path}`, sortText: `1_${e.lower}` });
  }
  for (const n of STD_NAMES) add({ label: n.name, kind: STD_KIND[n.kind], detail: n.detail, sortText: `2_${n.name}` });
  for (const s of SNIPPETS) add({ ...s, sortText: `3_${s.label}` });
  for (const k of KEYWORDS) add({ label: k, kind: CompletionKind.Keyword, sortText: `4_${k}` });
  return items;
}

export function hover(ws: WorkspaceAnalysis, contents: Map<string, string>, path: string, pos: Position): Hover | null {
  const lineSrc = lineText(contents.get(path) ?? '', pos.line);
  const tok = lex(lineSrc).tokens.find((t) => t.col <= pos.character && pos.character < t.end && (t.kind === 'id' || t.kind === 'keyword'));
  if (!tok) return null;
  const range: Range = { start: { line: pos.line, character: tok.col }, end: { line: pos.line, character: tok.end } };

  if (tok.kind === 'id') {
    const local = visibleDeclarations(ws, path).filter((d) => d.lower === tok.lower);
    const pool = local.length > 0 ? local : ws.allDeclarations.filter((d) => d.lower === tok.lower);
    // Prefer a real declaration over a label or library clause.
    const best = pool.find((d) => d.kind !== 'label' && d.kind !== 'library') ?? pool[0];
    if (best) {
      return {
        contents: { kind: 'markdown', value: '```vhdl\n' + best.detail + '\n```\n' + `Declared in \`${best.path}\` line ${best.line + 1}` },
        range,
      };
    }
  }
  const std = STD_NAME_MAP.get(tok.lower);
  const doc = HOVER_DOCS[tok.lower];
  if (std || doc) {
    const head = std ? `**${std.name}** (${std.kind}, ${std.detail})` : `**${tok.lower}**`;
    return { contents: { kind: 'markdown', value: doc ? `${head}\n\n${doc}` : head }, range };
  }
  return null;
}
