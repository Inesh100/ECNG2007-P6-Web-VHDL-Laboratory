/**
 * VHDL language definition for Monaco: syntax highlighting (Monarch) and
 * editor behaviour (comments, brackets, auto-closing, indentation).
 * P6A-FR-2, P6A-UR-1. Plain data, so it has no Monaco import.
 */
import { KEYWORDS, STD_NAMES } from '../languageService/vhdlNames';

export const VHDL_LANGUAGE_ID = 'vhdl';

export const vhdlLanguageExtension = {
  id: VHDL_LANGUAGE_ID,
  extensions: ['.vhd', '.vhdl'],
  aliases: ['VHDL', 'vhdl'],
  mimetypes: ['text/x-vhdl'],
};

export const vhdlLanguageConfiguration = {
  comments: { lineComment: '--', blockComment: ['/*', '*/'] as [string, string] },
  brackets: [['(', ')']] as [string, string][],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  indentationRules: {
    increaseIndentPattern: /^\s*(.*\b(is|begin|then|else|loop|generate|record)\b\s*(--.*)?|.*\(\s*)$/i,
    decreaseIndentPattern: /^\s*(end\b|else\b|elsif\b|begin\b|when\b|\))/i,
  },
  wordPattern: /[A-Za-z_][A-Za-z0-9_]*/,
};

const TYPE_NAMES = STD_NAMES.filter((n) => n.kind === 'type').map((n) => n.name);
const FUNCTION_NAMES = STD_NAMES.filter((n) => n.kind === 'function').map((n) => n.name);

/** Monarch tokenizer. VHDL is case-insensitive, so `ignoreCase` is on. */
export const vhdlMonarch = {
  ignoreCase: true,
  defaultToken: '',
  keywords: [...KEYWORDS],
  typeKeywords: TYPE_NAMES,
  builtins: [...FUNCTION_NAMES, 'true', 'false', 'note', 'warning', 'error', 'failure'],
  operators: ['<=', '=>', ':=', '/=', '>=', '**', '=', '<', '>', '+', '-', '*', '/', '&'],
  symbols: /[=><!~?:&|+\-*/^%]+/,
  tokenizer: {
    root: [
      [/--.*$/, 'comment'],
      [/\/\*/, 'comment', '@blockComment'],
      [/\d*[uUsS]?[bBoOxXdD]"[^"]*"/, 'number.hex'],
      [/"([^"]|"")*"/, 'string'],
      [/'.'/, 'string.char'],
      [/\d[\d_]*#[0-9A-Fa-f_.]+#/, 'number'],
      [/\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?/, 'number'],
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@builtins': 'predefined',
            '@default': 'identifier',
          },
        },
      ],
      [/[()]/, '@brackets'],
      [/[;,.]/, 'delimiter'],
      [/'/, 'operator'],
      [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
      [/\s+/, 'white'],
    ],
    blockComment: [
      [/[^*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/\*/, 'comment'],
    ],
  },
};
