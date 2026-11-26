/**
 * Small VHDL lexer for the P6A language-service simulator.
 *
 * Positions are zero-based (line, character), as in the Language Server
 * Protocol. Comments are dropped. Identifiers are case-insensitive in VHDL, so
 * every token also carries a lower-case copy.
 */
import { KEYWORDS } from './vhdlNames';

export type TokenKind = 'id' | 'keyword' | 'number' | 'string' | 'char' | 'bitstring' | 'symbol';

export interface Token {
  kind: TokenKind;
  text: string;
  lower: string;
  line: number;
  /** Start character on the line. */
  col: number;
  /** End character on the line (exclusive). */
  end: number;
}

export interface LexProblem {
  line: number;
  col: number;
  end: number;
  message: string;
}

export interface LexResult {
  tokens: Token[];
  problems: LexProblem[];
}

const TWO_CHAR = new Set(['<=', '=>', ':=', '/=', '>=', '**', '<>', '??', '?=', '?<', '?>']);
const isLetter = (c: string) => /[A-Za-z]/.test(c);
const isIdChar = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => /[0-9]/.test(c);

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const problems: LexProblem[] = [];
  const lines = source.split(/\r?\n/);
  let inBlockComment = false;

  for (let ln = 0; ln < lines.length; ln++) {
    const text = lines[ln];
    let i = 0;
    const push = (kind: TokenKind, start: number, endExclusive: number) => {
      const t = text.slice(start, endExclusive);
      tokens.push({ kind, text: t, lower: t.toLowerCase(), line: ln, col: start, end: endExclusive });
    };

    while (i < text.length) {
      if (inBlockComment) {
        const close = text.indexOf('*/', i);
        if (close < 0) {
          i = text.length;
          break;
        }
        inBlockComment = false;
        i = close + 2;
        continue;
      }
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\f' || c === '\v') {
        i++;
        continue;
      }
      // -- line comment
      if (c === '-' && text[i + 1] === '-') break;
      // /* block comment */ (VHDL-2008)
      if (c === '/' && text[i + 1] === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
      // bit-string literal: x"0F", b"0101", 8x"FF", ux"..", sx".."
      const bit = /^(\d*)([uUsS]?[bBoOxXdD])"/.exec(text.slice(i));
      if (bit && (bit[1] !== '' || i === 0 || !isIdChar(text[i - 1]))) {
        const start = i;
        let j = i + bit[0].length;
        while (j < text.length && text[j] !== '"') j++;
        if (j >= text.length) problems.push({ line: ln, col: start, end: text.length, message: 'unterminated bit string literal' });
        push('bitstring', start, Math.min(j + 1, text.length));
        i = j + 1;
        continue;
      }
      if (isLetter(c)) {
        const start = i;
        while (i < text.length && isIdChar(text[i])) i++;
        const word = text.slice(start, i);
        push(KEYWORDS.has(word.toLowerCase()) ? 'keyword' : 'id', start, i);
        continue;
      }
      // extended identifier \like this\
      if (c === '\\') {
        const start = i;
        const close = text.indexOf('\\', i + 1);
        i = close < 0 ? text.length : close + 1;
        push('id', start, i);
        continue;
      }
      if (isDigit(c)) {
        const start = i;
        const based = /^\d[\d_]*#[0-9A-Fa-f_.]+#([eE][+-]?\d+)?/.exec(text.slice(i));
        if (based) {
          i += based[0].length;
        } else {
          const m = /^\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d[\d_]*)?/.exec(text.slice(i));
          i += m ? m[0].length : 1;
        }
        push('number', start, i);
        continue;
      }
      if (c === '"') {
        const start = i;
        i++;
        let closed = false;
        while (i < text.length) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') {
              i += 2;
              continue;
            }
            i++;
            closed = true;
            break;
          }
          i++;
        }
        if (!closed) problems.push({ line: ln, col: start, end: text.length, message: 'unterminated string literal' });
        push('string', start, i);
        continue;
      }
      if (c === "'") {
        // A tick after a name or ')' is an attribute or qualified expression;
        // otherwise 'x' is a character literal.
        const prev = tokens[tokens.length - 1];
        const afterName =
          prev !== undefined &&
          prev.line === ln &&
          prev.end === i &&
          (prev.kind === 'id' || prev.text === ')' || prev.lower === 'all');
        if (!afterName && text[i + 2] === "'") {
          push('char', i, i + 3);
          i += 3;
          continue;
        }
        push('symbol', i, i + 1);
        i++;
        continue;
      }
      const two = text.slice(i, i + 2);
      if (TWO_CHAR.has(two)) {
        push('symbol', i, i + 2);
        i += 2;
        continue;
      }
      push('symbol', i, i + 1);
      i++;
    }
  }
  return { tokens, problems };
}
