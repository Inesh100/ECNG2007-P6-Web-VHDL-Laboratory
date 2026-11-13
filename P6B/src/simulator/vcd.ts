/**
 * Minimal VCD writer used by the service simulator to produce a contract-shaped
 * waveform artefact. Output follows IEEE 1364 VCD, which Surfer reads.
 */

export interface VcdSignal {
  id: string;
  name: string;
  width: number;
  scope: string;
}

export interface VcdChange {
  time: number;
  id: string;
  value: number;
}

export function toBinary(value: number, width: number): string {
  const v = ((value % 2 ** width) + 2 ** width) % 2 ** width;
  return v.toString(2).padStart(width, '0');
}

export function writeVcd(opts: {
  date: string;
  timescale: string;
  signals: VcdSignal[];
  initial: Record<string, number>;
  changes: VcdChange[];
  endTime: number;
}): string {
  const lines: string[] = [];
  lines.push('$date', `  ${opts.date}`, '$end');
  lines.push('$version', '  P6B parent-project service simulator (HDL Service Contract v1)', '$end');
  lines.push(`$timescale ${opts.timescale} $end`);

  // Group signals by scope path (a.b.c) and emit nested $scope blocks.
  const scopes = new Map<string, VcdSignal[]>();
  for (const s of opts.signals) {
    const list = scopes.get(s.scope) ?? [];
    list.push(s);
    scopes.set(s.scope, list);
  }
  const sortedScopes = [...scopes.keys()].sort();
  let open: string[] = [];
  for (const scope of sortedScopes) {
    const parts = scope.split('.');
    let common = 0;
    while (common < open.length && common < parts.length && open[common] === parts[common]) common++;
    for (let i = open.length; i > common; i--) lines.push('$upscope $end');
    for (let i = common; i < parts.length; i++) lines.push(`$scope module ${parts[i]} $end`);
    open = parts;
    for (const s of scopes.get(scope)!) {
      lines.push(`$var wire ${s.width} ${s.id} ${s.name}${s.width > 1 ? ` [${s.width - 1}:0]` : ''} $end`);
    }
  }
  for (let i = 0; i < open.length; i++) lines.push('$upscope $end');
  lines.push('$enddefinitions $end');

  const fmt = (s: VcdSignal, v: number) => (s.width === 1 ? `${v & 1}${s.id}` : `b${toBinary(v, s.width)} ${s.id}`);
  const byId = new Map(opts.signals.map((s) => [s.id, s]));

  lines.push('#0', '$dumpvars');
  for (const s of opts.signals) lines.push(fmt(s, opts.initial[s.id] ?? 0));
  lines.push('$end');

  const sorted = [...opts.changes].sort((a, b) => a.time - b.time);
  let current = -1;
  for (const c of sorted) {
    if (c.time === 0) continue; // already in $dumpvars
    if (c.time !== current) {
      lines.push(`#${c.time}`);
      current = c.time;
    }
    lines.push(fmt(byId.get(c.id)!, c.value));
  }
  if (current !== opts.endTime) lines.push(`#${opts.endTime}`);
  return lines.join('\n') + '\n';
}
