/**
 * Quick built-in waveform view (like VHDLive's Waveform tab), drawn with SVG.
 * Click the traces to move the cursor; the values at the cursor show on the left.
 * For full waveform work the Surfer tab / Surfer pop-out is used (P6B-FR-13).
 */
import { useMemo, useState } from 'react';
import { formatValue, parseVcd, valueAt, type Signal } from '../lib/vcdParser';

const ROW = 28; // height of one signal row in pixels
const NAME_W = 190; // width of the name column

interface Props {
  vcd: string;
}

export function WaveformView({ vcd }: Props) {
  const wave = useMemo(() => parseVcd(vcd), [vcd]);
  const [zoom, setZoom] = useState(1); // 1 = fit to width
  const [cursor, setCursor] = useState(0);
  const [filter, setFilter] = useState('');

  const traceWidth = 1100 * zoom;
  const end = Math.max(wave.endTime, 1);
  const x = (t: number) => (t / end) * traceWidth;

  const shown = wave.signals.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));

  // Group rows by scope like VHDLive: a header row per scope, then its signals.
  const rows: ({ kind: 'scope'; scope: string; count: number } | { kind: 'signal'; signal: Signal })[] = [];
  let lastScope = '';
  for (const s of shown) {
    if (s.scope !== lastScope) {
      rows.push({ kind: 'scope', scope: s.scope, count: shown.filter((x) => x.scope === s.scope).length });
      lastScope = s.scope;
    }
    rows.push({ kind: 'signal', signal: s });
  }

  // Tick marks along the top ruler
  const tickCount = Math.round(6 * zoom);
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i++) ticks.push(Math.round((end * i) / tickCount));
  const unit = wave.timescale.replace(/^1/, '');

  const onTraceClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - box.left) / traceWidth) * end;
    setCursor(Math.max(0, Math.min(end, Math.round(t))));
  };

  return (
    <div className="wave" data-testid="wave-view">
      <div className="wave-tools">
        <input className="wave-filter" placeholder={`🔍 Filter ${wave.signals.length} signals…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="muted">cursor {cursor} {unit}</span>
        <span className="spacer" />
        <button className="vbtn sm" onClick={() => setZoom(zoom * 2)} title="Zoom in">+</button>
        <button className="vbtn sm" onClick={() => setZoom(Math.max(1, zoom / 2))} title="Zoom out">−</button>
        <button className="vbtn sm" onClick={() => setZoom(1)} title="Fit">fit</button>
      </div>

      <div className="wave-body">
        <div className="wave-names" style={{ width: NAME_W }}>
          <div className="wave-ruler-pad" />
          {rows.map((r, i) =>
            r.kind === 'scope' ? (
              <div key={i} className="wave-scope" style={{ height: ROW }}>▾ {r.scope.replace(/\./g, '/')} <span className="muted">{r.count}</span></div>
            ) : (
              <div key={i} className="wave-name" style={{ height: ROW }}>
                <span>{r.signal.name}</span>
                <span className="wave-val">{formatValue(valueAt(r.signal, cursor), r.signal.width)}</span>
              </div>
            ),
          )}
        </div>

        <div className="wave-scroll">
          <svg width={traceWidth + 20} height={24 + rows.length * ROW} onClick={onTraceClick} className="wave-svg">
            {/* ruler */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={18} y2={24 + rows.length * ROW} className="wave-grid" />
                <text x={x(t) + 3} y={13} className="wave-tick">{t}{unit}</text>
              </g>
            ))}
            {/* traces */}
            {rows.map((r, i) => (r.kind === 'signal' ? <Trace key={i} signal={r.signal} y={24 + i * ROW} end={end} x={x} /> : null))}
            {/* cursor */}
            <line x1={x(cursor)} x2={x(cursor)} y1={0} y2={24 + rows.length * ROW} className="wave-cursor" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/** Draws one signal: a square wave for single bits, a "bus" shape for vectors. */
function Trace({ signal, y, end, x }: { signal: Signal; y: number; end: number; x: (t: number) => number }) {
  const high = y + 6;
  const low = y + ROW - 6;
  const changes = signal.changes;

  if (signal.width === 1) {
    let points = '';
    for (let i = 0; i < changes.length; i++) {
      const level = changes[i].value === '1' ? high : low;
      const next = i + 1 < changes.length ? changes[i + 1].time : end;
      points += `${x(changes[i].time)},${level} ${x(next)},${level} `;
    }
    return <polyline points={points} className="wave-bit" />;
  }

  // Vector: one box per value, with the value written inside if it fits.
  return (
    <g>
      {changes.map((c, i) => {
        const x1 = x(c.time);
        const x2 = x(i + 1 < changes.length ? changes[i + 1].time : end);
        const mid = (high + low) / 2;
        const label = formatValue(c.value, signal.width);
        return (
          <g key={i}>
            <polygon points={`${x1},${mid} ${x1 + 3},${high} ${x2 - 3},${high} ${x2},${mid} ${x2 - 3},${low} ${x1 + 3},${low}`} className="wave-bus" />
            {x2 - x1 > label.length * 7 + 6 && (
              <text x={x1 + 6} y={mid + 4} className="wave-bus-text">{label}</text>
            )}
          </g>
        );
      })}
    </g>
  );
}
