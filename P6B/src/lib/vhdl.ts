/**
 * Small text helpers for showing VHDL nicely. These only colour text and read
 * entity names/ports for the Properties panel. They are NOT a language server:
 * live diagnostics and completion are P6A's job and are not done here.
 */

const KEYWORDS = new Set([
  'library', 'use', 'entity', 'is', 'end', 'architecture', 'of', 'begin', 'signal', 'constant',
  'variable', 'port', 'generic', 'map', 'in', 'out', 'inout', 'process', 'if', 'then', 'elsif',
  'else', 'case', 'when', 'others', 'wait', 'for', 'until', 'on', 'after', 'assert', 'report',
  'severity', 'note', 'warning', 'error', 'failure', 'and', 'or', 'not', 'xor', 'nand', 'nor',
  'downto', 'to', 'loop', 'while', 'function', 'procedure', 'return', 'type', 'subtype',
  'component', 'all', 'work', 'generate', 'select', 'with', 'rising_edge', 'falling_edge',
]);

const TYPES = new Set(['std_logic', 'std_logic_vector', 'unsigned', 'signed', 'integer', 'natural', 'boolean', 'time', 'bit', 'bit_vector', 'ieee', 'std_logic_1164', 'numeric_std']);

export interface Token {
  text: string;
  kind: 'keyword' | 'type' | 'string' | 'char' | 'number' | 'comment' | 'plain';
}

/** Splits one line of VHDL into coloured pieces. */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    let m: RegExpMatchArray | null;

    if (rest.startsWith('--')) {
      tokens.push({ text: rest, kind: 'comment' });
      break;
    } else if ((m = rest.match(/^"[^"]*"?/))) {
      tokens.push({ text: m[0], kind: 'string' });
    } else if ((m = rest.match(/^'[01xXzZuU\-]'/))) {
      tokens.push({ text: m[0], kind: 'char' });
    } else if ((m = rest.match(/^\d+(\.\d+)?/))) {
      tokens.push({ text: m[0], kind: 'number' });
    } else if ((m = rest.match(/^[A-Za-z_]\w*/))) {
      const word = m[0].toLowerCase();
      const kind = KEYWORDS.has(word) ? 'keyword' : TYPES.has(word) ? 'type' : 'plain';
      tokens.push({ text: m[0], kind });
    } else {
      m = rest.match(/^[^A-Za-z_\d"'-]+|^./);
      tokens.push({ text: m![0], kind: 'plain' });
    }
    i += m ? m[0].length : 1;
  }
  return tokens;
}

export interface Port {
  name: string;
  direction: string; // in, out, inout
  type: string;
}

/** Lists the entity names declared in some VHDL text. */
export function findEntities(text: string): string[] {
  const names: string[] = [];
  const re = /^\s*entity\s+(\w+)\s+is/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) names.push(m[1]);
  return names;
}

/** Reads the ports of the first entity in some VHDL text (simple cases only). */
export function findPorts(text: string): Port[] {
  const ports: Port[] = [];
  const portBlock = text.match(/port\s*\(([\s\S]*?)\)\s*;\s*end/i);
  if (!portBlock) return ports;
  for (const raw of portBlock[1].split(';')) {
    const line = raw.replace(/--.*$/gm, '').trim();
    const m = line.match(/^([\w\s,]+):\s*(in|out|inout|buffer)\s+(.+)$/i);
    if (!m) continue;
    for (const name of m[1].split(',')) {
      ports.push({ name: name.trim(), direction: m[2].toLowerCase(), type: m[3].trim() });
    }
  }
  return ports;
}
