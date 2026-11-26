/**
 * P6A VHDL language-service simulator: diagnostics and symbol tables.
 *
 * This is a TEST DOUBLE that stands in for VHDL-LS behind HDL Service Contract
 * v1 (Project 5B), so that P6A can be verified without Project 5 (P6-StR3.1,
 * P6A-FR-5). It is not a VHDL compiler. It implements a small, deterministic set
 * of checks that cover the approved diagnostic scenarios for the prescribed
 * counter file model (see scenarios.ts and docs/language-service-scenarios.md):
 *
 *   E-SEMI    missing ';' between statements
 *   E-PAREN   unbalanced parentheses
 *   E-BLOCK   missing or unexpected 'end ...'
 *   E-NAME    closing name does not match ('misspelling, "rtl" expected')
 *   E-UNDECL  assignment target or sensitivity-list name is not declared
 *   E-UNIT    'entity work.x' where x is not in the workspace
 *   E-LEX     unterminated string / bit-string literal
 *   W-UNUSED  signal declared but never used
 *
 * Message wording follows GHDL so that the editor and P6B's run results use the
 * same words for the same problem (e.g. "';' is expected here").
 *
 * All positions are zero-based, as in the Language Server Protocol, and the
 * shapes below are structurally identical to LSP's Diagnostic.
 */
import { lex, type Token } from './lexer';
import { STD_NAME_MAP } from './vhdlNames';

export interface SourceFile {
  path: string;
  content: string;
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export const Severity = { Error: 1, Warning: 2, Information: 3, Hint: 4 } as const;
export type SeverityValue = (typeof Severity)[keyof typeof Severity];

export const DIAGNOSTIC_SOURCE = 'p6a-vhdl-ls (simulator)';

export interface Diagnostic {
  range: Range;
  severity: SeverityValue;
  code: string;
  source: string;
  message: string;
}

export type DeclKind =
  | 'entity'
  | 'architecture'
  | 'package'
  | 'component'
  | 'port'
  | 'generic'
  | 'signal'
  | 'constant'
  | 'variable'
  | 'file'
  | 'alias'
  | 'type'
  | 'subtype'
  | 'enum'
  | 'function'
  | 'procedure'
  | 'parameter'
  | 'label'
  | 'library'
  | 'loop';

export interface Declaration {
  name: string;
  lower: string;
  kind: DeclKind;
  /** One-line VHDL text, e.g. "signal count_r : unsigned(WIDTH - 1 downto 0)". */
  detail: string;
  path: string;
  line: number;
  col: number;
  end: number;
  /** Lower-case name of the enclosing unit (entity, architecture, component, subprogram). */
  owner?: string;
}

export interface ArchitectureInfo {
  name: string;
  entity: string;
}

export interface FileAnalysis {
  path: string;
  tokens: Token[];
  declarations: Declaration[];
  architectures: ArchitectureInfo[];
  diagnostics: Diagnostic[];
}

export interface WorkspaceAnalysis {
  files: Map<string, FileAnalysis>;
  /** Entities by lower-case name. */
  entities: Map<string, Declaration>;
  allDeclarations: Declaration[];
}

// ------------------------------------------------------------------ helpers

const OPERAND_KINDS = new Set(['id', 'number', 'string', 'char', 'bitstring']);

function rangeOf(t: Token): Range {
  return { start: { line: t.line, character: t.col }, end: { line: t.line, character: t.end } };
}

function diag(t: Token, severity: SeverityValue, code: string, message: string): Diagnostic {
  return { range: rangeOf(t), severity, code, source: DIAGNOSTIC_SOURCE, message };
}

/** Joins tokens back into readable VHDL, e.g. "unsigned(WIDTH - 1 downto 0)". */
export function joinTokens(tokens: Token[]): string {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    const noSpaceBefore = t.text === ')' || t.text === ',' || t.text === '.' || t.text === "'" || (t.text === '(' && prev && (prev.kind === 'id' || prev.kind === 'keyword'));
    const noSpaceAfterPrev = prev && (prev.text === '(' || prev.text === '.' || prev.text === "'");
    if (i > 0 && !noSpaceBefore && !noSpaceAfterPrev) out += ' ';
    out += t.text;
  }
  return out;
}

/** Index of the ')' matching the '(' at `open`, or -1. */
function matchParen(tokens: Token[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i].text === '(') depth++;
    else if (tokens[i].text === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ------------------------------------------------------------------ declarations

function parseInterfaceList(
  tokens: Token[],
  open: number,
  kind: DeclKind,
  path: string,
  owner: string | undefined,
  out: Declaration[],
): number {
  const close = matchParen(tokens, open);
  const last = close < 0 ? tokens.length : close;
  let start = open + 1;
  let depth = 0;
  const flush = (endIdx: number) => {
    const el = tokens.slice(start, endIdx);
    const colon = el.findIndex((t) => t.text === ':');
    if (colon > 0) {
      const names = el.slice(0, colon).filter((t) => t.kind === 'id');
      const assign = el.findIndex((t) => t.text === ':=');
      const typeText = joinTokens(el.slice(colon + 1, assign < 0 ? el.length : assign));
      for (const n of names) {
        out.push({ name: n.text, lower: n.lower, kind, detail: `${kind} ${n.text} : ${typeText}`, path, line: n.line, col: n.col, end: n.end, owner });
      }
    }
  };
  for (let i = open + 1; i < last; i++) {
    const t = tokens[i];
    if (t.text === '(') depth++;
    else if (t.text === ')') depth--;
    else if (t.text === ';' && depth === 0) {
      flush(i);
      start = i + 1;
    }
  }
  flush(last);
  return last;
}

const LABEL_PREV = new Set([';', 'begin', 'is', 'then', 'else', '=>', 'generate', 'loop']);

function collectDeclarations(tokens: Token[], path: string): { declarations: Declaration[]; architectures: ArchitectureInfo[] } {
  const out: Declaration[] = [];
  const architectures: ArchitectureInfo[] = [];
  let owner: string | undefined;
  let depth = 0;

  const add = (t: Token, kind: DeclKind, detail: string, own = owner) =>
    out.push({ name: t.text, lower: t.lower, kind, detail, path, line: t.line, col: t.col, end: t.end, owner: own });

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (t.text === '(') depth++;
    if (t.text === ')') depth = Math.max(0, depth - 1);
    if (depth > 0) continue;

    if (t.kind === 'id' && next?.text === ':' && (prev === undefined || LABEL_PREV.has(prev.lower))) {
      const what = tokens[i + 2]?.lower ?? '';
      add(t, 'label', `${t.text} : ${what}`);
      continue;
    }
    if (t.kind !== 'keyword' || prev?.lower === 'end') continue;

    switch (t.lower) {
      case 'entity':
        if (next?.kind === 'id' && tokens[i + 2]?.lower === 'is') {
          add(next, 'entity', `entity ${next.text}`, undefined);
          owner = next.lower;
        }
        break;
      case 'architecture':
        if (next?.kind === 'id' && tokens[i + 2]?.lower === 'of' && tokens[i + 3]) {
          const ent = tokens[i + 3];
          add(next, 'architecture', `architecture ${next.text} of ${ent.text}`, ent.lower);
          architectures.push({ name: next.lower, entity: ent.lower });
          owner = next.lower;
        }
        break;
      case 'package':
        if (next?.kind === 'id' && tokens[i + 2]?.lower === 'is' && tokens[i + 3]?.lower !== 'new') {
          add(next, 'package', `package ${next.text}`, undefined);
          owner = next.lower;
        }
        break;
      case 'component':
        if (prev?.text !== ':' && next?.kind === 'id') {
          add(next, 'component', `component ${next.text}`);
          owner = next.lower;
        }
        break;
      case 'generic':
      case 'port':
        if (next?.text === '(') i = parseInterfaceList(tokens, i + 1, t.lower as DeclKind, path, owner, out);
        break;
      case 'signal':
      case 'constant':
      case 'variable':
      case 'file': {
        if (prev?.text === ':') break; // attribute specification "... : signal is"
        let j = i + 1;
        const names: Token[] = [];
        while (j < tokens.length && tokens[j].text !== ':' && tokens[j].text !== ';') {
          if (tokens[j].kind === 'id') names.push(tokens[j]);
          j++;
        }
        if (tokens[j]?.text !== ':') break;
        let k = j + 1;
        while (k < tokens.length && tokens[k].text !== ';' && tokens[k].text !== ':=' && tokens[k].lower !== 'is') k++;
        const typeText = joinTokens(tokens.slice(j + 1, k));
        for (const n of names) add(n, t.lower as DeclKind, `${t.lower} ${n.text} : ${typeText}`);
        break;
      }
      case 'alias':
        if (next?.kind === 'id') add(next, 'alias', `alias ${next.text}`);
        break;
      case 'type':
      case 'subtype':
        if (next?.kind === 'id') {
          let k = i + 2;
          while (k < tokens.length && tokens[k].text !== ';') k++;
          add(next, t.lower as DeclKind, `${t.lower} ${next.text} ${joinTokens(tokens.slice(i + 2, k))}`.trim());
          if (t.lower === 'type' && tokens[i + 2]?.lower === 'is' && tokens[i + 3]?.text === '(') {
            const close = matchParen(tokens, i + 3);
            for (let e = i + 4; e < (close < 0 ? tokens.length : close); e++) {
              if (tokens[e].kind === 'id') add(tokens[e], 'enum', `${tokens[e].text} : enumeration literal of ${next.text}`);
            }
          }
        }
        break;
      case 'function':
      case 'procedure':
        if (next && (next.kind === 'id' || next.kind === 'string')) {
          add(next, t.lower as DeclKind, `${t.lower} ${next.text}`);
          if (tokens[i + 2]?.text === '(') i = parseInterfaceList(tokens, i + 2, 'parameter', path, next.lower, out);
        }
        break;
      case 'for':
        if (next?.kind === 'id' && tokens[i + 2]?.lower === 'in') add(next, 'loop', `for ${next.text} in ... (loop parameter)`);
        break;
      case 'library': {
        let j = i + 1;
        while (j < tokens.length && tokens[j].text !== ';') {
          if (tokens[j].kind === 'id') add(tokens[j], 'library', `library ${tokens[j].text}`, undefined);
          j++;
        }
        break;
      }
    }
  }
  return { declarations: out, architectures };
}

// ------------------------------------------------------------------ checks

function checkParens(tokens: Token[], out: Diagnostic[]): void {
  const open: Token[] = [];
  for (const t of tokens) {
    if (t.text === '(') open.push(t);
    else if (t.text === ')') {
      if (open.length === 0) out.push(diag(t, Severity.Error, 'E-PAREN', "unexpected ')'"));
      else open.pop();
    }
  }
  for (const t of open) out.push(diag(t, Severity.Error, 'E-PAREN', "')' is expected to close this '('"));
}

const STATEMENT_BOUNDARY = new Set(['begin', 'then', 'else', 'loop', 'generate', 'is', '=>']);
const NEXT_STATEMENT_KEYWORDS = new Set(
  `signal constant variable shared type subtype alias component attribute file begin end architecture entity library use
   package process if elsif else wait assert case when for while loop return null exit next generic port function
   procedure impure pure configuration with report severity`.split(/\s+/).filter(Boolean),
);
const TERMINAL_KEYWORDS = new Set(['all', 'null', 'wait', 'exit', 'next', 'return']);

function checkSemicolons(tokens: Token[], out: Diagnostic[]): void {
  let depth = 0;
  let stmt: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text === '(') depth++;
    else if (t.text === ')') depth = Math.max(0, depth - 1);

    const isBoundary = depth === 0 && (t.text === ';' || STATEMENT_BOUNDARY.has(t.lower));
    if (!isBoundary) stmt.push(t);

    const next = tokens[i + 1];
    const atLineEnd = next === undefined || next.line > t.line;
    if (atLineEnd && !isBoundary && depth === 0 && stmt.length > 0) {
      const first = stmt[0].lower;
      const has = (w: string) => stmt.some((s) => s.lower === w);
      const operandEnd = OPERAND_KINDS.has(t.kind) || t.text === ')' || first === 'end' || TERMINAL_KEYWORDS.has(t.lower);
      let missing = false;
      if (operandEnd) {
        if (next === undefined) {
          missing = true;
        } else {
          const after = tokens[i + 2];
          const nextStarts =
            (next.kind === 'keyword' && NEXT_STATEMENT_KEYWORDS.has(next.lower)) ||
            (next.kind === 'id' && after !== undefined && (after.text === '<=' || after.text === ':=' || after.text === ':'));
          missing = nextStarts;
          if (missing && has('process') && first !== 'end') missing = false;
          if (missing && (next.lower === 'generic' || next.lower === 'port') && !['end', 'use', 'library'].includes(first)) missing = false;
          if (missing && (next.lower === 'report' || next.lower === 'severity') && (has('assert') || has('report'))) missing = false;
          if (missing && (next.lower === 'else' || next.lower === 'when') && (has('when') || has('select'))) missing = false;
          if (missing && next.lower === 'loop' && (has('for') || has('while'))) missing = false;
        }
      }
      if (missing) out.push(diag(t, Severity.Error, 'E-SEMI', "';' is expected here"));
    }
    if (isBoundary) stmt = [];
  }
}

interface Block {
  kind: string;
  name?: string;
  token: Token;
  awaitingThen?: boolean;
}

const KIND_REQUIRED_IN_END = new Set(['if', 'process', 'case', 'loop', 'generate', 'component', 'record', 'block', 'protected', 'units']);
const END_KIND_WORDS = new Set(['if', 'process', 'case', 'loop', 'generate', 'entity', 'architecture', 'component', 'record', 'function', 'procedure', 'package', 'block', 'protected', 'units']);

function checkBlocks(tokens: Token[], out: Diagnostic[]): void {
  const stack: Block[] = [];
  const top = () => stack[stack.length - 1];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'keyword') continue;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const afterEnd = prev?.lower === 'end';

    if (t.lower === 'then') {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].awaitingThen) {
          stack[s].awaitingThen = false;
          break;
        }
      }
      continue;
    }
    if (afterEnd && t.lower !== 'end') continue;

    switch (t.lower) {
      case 'entity':
        if (next?.kind === 'id' && tokens[i + 2]?.lower === 'is') stack.push({ kind: 'entity', name: next.text, token: t });
        break;
      case 'architecture':
        if (next?.kind === 'id') stack.push({ kind: 'architecture', name: next.text, token: t });
        break;
      case 'package': {
        const isBody = next?.lower === 'body';
        const nameTok = isBody ? tokens[i + 2] : next;
        const isTok = tokens[i + (isBody ? 3 : 2)];
        if (nameTok?.kind === 'id' && isTok?.lower === 'is' && tokens[i + (isBody ? 4 : 3)]?.lower !== 'new') stack.push({ kind: 'package', name: nameTok.text, token: t });
        break;
      }
      case 'process': {
        const label = prev?.text === ':' && tokens[i - 2]?.kind === 'id' ? tokens[i - 2].text : undefined;
        stack.push({ kind: 'process', name: label, token: t });
        break;
      }
      case 'if':
        stack.push({ kind: 'if', token: t, awaitingThen: true });
        break;
      case 'case':
        stack.push({ kind: 'case', token: t });
        break;
      case 'loop':
        stack.push({ kind: 'loop', token: t });
        break;
      case 'generate': {
        const b = top();
        if (b && b.kind === 'if' && b.awaitingThen) {
          b.kind = 'generate';
          b.awaitingThen = false;
        } else stack.push({ kind: 'generate', token: t });
        break;
      }
      case 'component':
        if (prev?.text !== ':' && next?.kind === 'id') stack.push({ kind: 'component', name: next.text, token: t });
        break;
      case 'record':
        stack.push({ kind: 'record', token: t });
        break;
      case 'block':
        stack.push({ kind: 'block', token: t });
        break;
      case 'protected':
        stack.push({ kind: 'protected', token: t });
        break;
      case 'units':
        stack.push({ kind: 'units', token: t });
        break;
      case 'function':
      case 'procedure': {
        let depth = 0;
        for (let j = i + 1; j < tokens.length; j++) {
          const u = tokens[j];
          if (u.text === '(') depth++;
          else if (u.text === ')') depth--;
          else if (depth === 0 && u.text === ';') break;
          else if (depth === 0 && u.lower === 'is') {
            if (tokens[j + 1]?.lower !== 'new') stack.push({ kind: t.lower, name: next?.text, token: t });
            break;
          }
        }
        break;
      }
      case 'end': {
        // end [kind [body]] [name] ;
        let j = i + 1;
        let kindTok: Token | undefined;
        if (tokens[j] && END_KIND_WORDS.has(tokens[j].lower)) {
          kindTok = tokens[j];
          j++;
          if (tokens[j]?.lower === 'body') j++;
        }
        const nameTok = tokens[j] && (tokens[j].kind === 'id' || tokens[j].kind === 'string') && tokens[j].line === t.line ? tokens[j] : undefined;
        const kindWord = kindTok?.lower;

        if (stack.length === 0) {
          out.push(diag(t, Severity.Error, 'E-BLOCK', kindWord ? `unexpected 'end ${kindWord}'` : "unexpected 'end'"));
          break;
        }

        let target = stack.length - 1;
        if (kindWord && stack[target].kind !== kindWord) {
          let k = stack.length - 1;
          while (k >= 0 && stack[k].kind !== kindWord) k--;
          if (k < 0) {
            out.push(diag(kindTok!, Severity.Error, 'E-BLOCK', `unexpected 'end ${kindWord}'`));
            break;
          }
          for (let s = stack.length - 1; s > k; s--) out.push(diag(t, Severity.Error, 'E-BLOCK', `'end ${stack[s].kind}' is expected`));
          target = k;
        } else if (!kindWord && KIND_REQUIRED_IN_END.has(stack[target].kind)) {
          out.push(diag(t, Severity.Error, 'E-BLOCK', `'end ${stack[target].kind}' is expected`));
        }

        const block = stack[target];
        if (nameTok && block.name && nameTok.lower !== block.name.toLowerCase()) {
          out.push(diag(nameTok, Severity.Error, 'E-NAME', `misspelling, "${block.name}" expected`));
        }
        stack.length = target;
        break;
      }
    }
  }

  const lastTok = tokens[tokens.length - 1];
  if (lastTok) {
    for (let s = stack.length - 1; s >= 0; s--) out.push(diag(lastTok, Severity.Error, 'E-BLOCK', `'end ${stack[s].kind}' is expected`));
  }
}

function checkAssignmentTargets(tokens: Token[], known: Set<string>, out: Diagnostic[]): void {
  let depth = 0;
  let atStart = true;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const startHere = atStart && depth === 0;

    if (t.text === '(') depth++;
    else if (t.text === ')') depth = Math.max(0, depth - 1);

    if (startHere && t.kind === 'id') {
      let j = i + 1;
      while (tokens[j]?.text === '.' && tokens[j + 1]?.kind === 'id') j += 2;
      if (tokens[j]?.text === '(') {
        const close = matchParen(tokens, j);
        j = close < 0 ? tokens.length : close + 1;
      }
      const op = tokens[j]?.text;
      if ((op === '<=' || op === ':=') && !known.has(t.lower)) {
        out.push(diag(t, Severity.Error, 'E-UNDECL', `no declaration for "${t.text}"`));
      }
    }

    // process (a, b, c): every name in the sensitivity list must be declared
    if (t.lower === 'process' && tokens[i - 1]?.lower !== 'end' && tokens[i + 1]?.text === '(') {
      const close = matchParen(tokens, i + 1);
      for (let j = i + 2; j < (close < 0 ? tokens.length : close); j++) {
        const u = tokens[j];
        if (u.kind === 'id' && tokens[j - 1]?.text !== '.' && !known.has(u.lower)) {
          out.push(diag(u, Severity.Error, 'E-UNDECL', `no declaration for "${u.text}"`));
        }
      }
    }

    if (depth === 0) {
      if (t.text === ';' || STATEMENT_BOUNDARY.has(t.lower)) atStart = true;
      else if (t.text === ':' && tokens[i - 1]?.kind === 'id' && startHereFor(tokens, i - 1)) atStart = true;
      else atStart = false;
    } else {
      atStart = false;
    }
  }

  function startHereFor(ts: Token[], idx: number): boolean {
    const p = ts[idx - 1];
    return p === undefined || LABEL_PREV.has(p.lower);
  }
}

function checkUnits(tokens: Token[], entities: Map<string, Declaration>, out: Diagnostic[]): void {
  for (let i = 0; i + 3 < tokens.length; i++) {
    if (tokens[i].lower === 'entity' && tokens[i + 1].lower === 'work' && tokens[i + 2].text === '.' && tokens[i + 3].kind === 'id') {
      const unit = tokens[i + 3];
      if (!entities.has(unit.lower)) out.push(diag(unit, Severity.Error, 'E-UNIT', `unit "${unit.lower}" not found in library "work"`));
    }
  }
}

function checkUnusedSignals(tokens: Token[], decls: Declaration[], out: Diagnostic[]): void {
  for (const d of decls) {
    if (d.kind !== 'signal') continue;
    const used = tokens.some((t) => t.kind === 'id' && t.lower === d.lower && !(t.line === d.line && t.col === d.col));
    if (!used) {
      out.push({
        range: { start: { line: d.line, character: d.col }, end: { line: d.line, character: d.end } },
        severity: Severity.Warning,
        code: 'W-UNUSED',
        source: DIAGNOSTIC_SOURCE,
        message: `signal "${d.name}" is declared but never used`,
      });
    }
  }
}

// ------------------------------------------------------------------ workspace

export function analyzeWorkspace(files: SourceFile[]): WorkspaceAnalysis {
  const lexed = files.map((f) => ({ file: f, ...lex(f.content) }));
  const perFile = lexed.map((l) => ({ ...l, ...collectDeclarations(l.tokens, l.file.path) }));

  const entities = new Map<string, Declaration>();
  const allDeclarations: Declaration[] = [];
  for (const p of perFile) {
    for (const d of p.declarations) {
      allDeclarations.push(d);
      if (d.kind === 'entity' && !entities.has(d.lower)) entities.set(d.lower, d);
    }
  }

  const known = new Set<string>([...STD_NAME_MAP.keys()]);
  for (const d of allDeclarations) known.add(d.lower);

  const result = new Map<string, FileAnalysis>();
  for (const p of perFile) {
    const diagnostics: Diagnostic[] = [];
    for (const lp of p.problems) {
      diagnostics.push({
        range: { start: { line: lp.line, character: lp.col }, end: { line: lp.line, character: lp.end } },
        severity: Severity.Error,
        code: 'E-LEX',
        source: DIAGNOSTIC_SOURCE,
        message: lp.message,
      });
    }
    checkParens(p.tokens, diagnostics);
    checkSemicolons(p.tokens, diagnostics);
    checkBlocks(p.tokens, diagnostics);
    checkAssignmentTargets(p.tokens, known, diagnostics);
    checkUnits(p.tokens, entities, diagnostics);
    checkUnusedSignals(p.tokens, p.declarations, diagnostics);
    diagnostics.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);

    result.set(p.file.path, {
      path: p.file.path,
      tokens: p.tokens,
      declarations: p.declarations,
      architectures: p.architectures,
      diagnostics,
    });
  }
  return { files: result, entities, allDeclarations };
}

/**
 * Names visible in a file: its own declarations, plus the generics and ports
 * of every entity that an architecture in this file implements.
 */
export function visibleDeclarations(ws: WorkspaceAnalysis, path: string): Declaration[] {
  const fa = ws.files.get(path);
  if (!fa) return [];
  const own = [...fa.declarations];
  for (const arch of fa.architectures) {
    for (const d of ws.allDeclarations) {
      if ((d.kind === 'port' || d.kind === 'generic') && d.owner === arch.entity && d.path !== path) own.push(d);
    }
  }
  return own;
}
