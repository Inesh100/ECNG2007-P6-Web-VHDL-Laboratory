/**
 * A small VCD (Value Change Dump) reader for the built-in waveform view.
 *
 * A VCD file has a header that declares the signals, then a list of time
 * stamps (#10) each followed by value changes ("1c" or "b0101 q").
 * Surfer is still the main viewer (P6B-FR-13); this just gives a quick preview.
 */

export interface Signal {
  id: string; // short code used in the file, e.g. "c"
  name: string; // e.g. "clk"
  scope: string; // e.g. "tb_counter.dut"
  width: number; // 1 for a single bit
  changes: { time: number; value: string }[]; // value is "0", "1" or a binary string
}

export interface Waveform {
  timescale: string; // e.g. "1ns"
  endTime: number;
  signals: Signal[];
}

export function parseVcd(text: string): Waveform {
  const signals: Signal[] = [];
  const byId: Record<string, Signal[]> = {};
  const scopes: string[] = [];
  let timescale = '1ns';
  let time = 0;
  let endTime = 0;
  let inHeader = true;

  const words = text.split(/\s+/).filter((w) => w.length > 0);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    if (inHeader) {
      if (w === '$timescale') {
        // "$timescale 1ns $end" or "$timescale 1 ns $end"
        let ts = '';
        i++;
        while (i < words.length && words[i] !== '$end') ts += words[i++];
        timescale = ts;
      } else if (w === '$scope') {
        scopes.push(words[i + 2]); // $scope module <name> $end
        i += 3;
      } else if (w === '$upscope') {
        scopes.pop();
        i += 1;
      } else if (w === '$var') {
        // $var wire <width> <id> <name> [range] $end
        const signal: Signal = {
          width: parseInt(words[i + 2], 10),
          id: words[i + 3],
          name: words[i + 4],
          scope: scopes.join('.'),
          changes: [],
        };
        signals.push(signal);
        if (!byId[signal.id]) byId[signal.id] = [];
        byId[signal.id].push(signal);
        while (i < words.length && words[i] !== '$end') i++;
      } else if (w === '$enddefinitions') {
        inHeader = false;
        i += 1;
      } else if (w.startsWith('$')) {
        // skip other header blocks ($date, $version, $comment)
        while (i < words.length && words[i] !== '$end') i++;
      }
      continue;
    }

    // Body: time stamps and value changes
    if (w.startsWith('#')) {
      time = parseInt(w.slice(1), 10);
      if (time > endTime) endTime = time;
    } else if (w === '$dumpvars' || w === '$end' || w === '$dumpall') {
      // markers only
    } else if (w[0] === 'b' || w[0] === 'B') {
      // vector: b0101 <id>
      const value = w.slice(1);
      const id = words[++i];
      for (const s of byId[id] ?? []) s.changes.push({ time, value });
    } else {
      // scalar: 1c, 0c, xc, zc
      const value = w[0];
      const id = w.slice(1);
      for (const s of byId[id] ?? []) s.changes.push({ time, value });
    }
  }

  return { timescale, endTime, signals };
}

/** The value of a signal at a given time (the last change at or before it). */
export function valueAt(signal: Signal, time: number): string {
  let value = 'x';
  for (const c of signal.changes) {
    if (c.time > time) break;
    value = c.value;
  }
  return value;
}

/** Formats a binary string for display: "0101" -> "5" (decimal), single bits stay as they are. */
export function formatValue(value: string, width: number): string {
  if (width === 1) return value;
  if (/[^01]/.test(value)) return value;
  return String(parseInt(value, 2));
}
