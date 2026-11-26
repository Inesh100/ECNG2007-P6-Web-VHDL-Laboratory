/**
 * Run & Results panel: hosts the real P6B app next to the editor (P6-StR4.1,
 * P6-AC4.1). P6B is loaded with ?workspace=shared so it reads THIS editor's
 * state over the IF-P6-WS-01 BroadcastChannel; nothing is copied or re-entered.
 *
 * Where P6B lives:
 *   default       ./P6B/index.html (combined site, and `npm run dev` after P6B is built)
 *   ?p6b=<url>    another location. Must be the SAME ORIGIN as this page,
 *                 because BroadcastChannel does not cross origins.
 */
import { useEffect, useMemo, useState } from 'react';

export function p6bUrl(search: string, base: string): URL {
  const override = new URLSearchParams(search).get('p6b');
  const env = (import.meta.env.VITE_P6B_URL as string | undefined) ?? './P6B/index.html';
  const url = new URL(override || env, base);
  url.searchParams.set('workspace', 'shared');
  return url;
}

type Availability = 'checking' | 'ok' | 'missing' | 'cross-origin';

export function RunPanel({ onClose }: { onClose: () => void }) {
  const url = useMemo(() => p6bUrl(window.location.search, window.location.href), []);
  const [state, setState] = useState<Availability>('checking');

  useEffect(() => {
    if (url.origin !== window.location.origin) {
      setState('cross-origin');
      return;
    }
    let cancelled = false;
    fetch(url.href, { cache: 'no-store' })
      .then(async (res) => {
        const text = res.ok ? await res.text() : '';
        // A dev server's SPA fallback returns P6A's own page: that is not P6B.
        const isP6B = res.ok && text.includes('P6B') && !text.includes('data-p6a-app');
        if (!cancelled) setState(isP6B ? 'ok' : 'missing');
      })
      .catch(() => !cancelled && setState('missing'));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <section className="run-panel" aria-label="Run and results (P6B)">
      <header className="panel-title">
        <span>RUN &amp; RESULTS — P6B</span>
        <span className="spacer" />
        <a className="icon-btn" href={url.href} target="_blank" rel="noreferrer" title="Open P6B in a new tab (stays connected to this editor)">
          ↗
        </a>
        <button className="icon-btn" onClick={onClose} title="Hide panel" aria-label="Hide run panel">
          ✕
        </button>
      </header>
      {state === 'ok' && <iframe className="run-frame" src={url.href} title="P6B Run, Results & Waveforms" data-testid="p6b-frame" />}
      {state === 'checking' && <div className="run-note">Looking for P6B at {url.pathname}…</div>}
      {state === 'missing' && (
        <div className="run-note">
          <p>
            <b>P6B was not found</b> at <code>{url.pathname}</code>.
          </p>
          <p>Build it once, then reload this page:</p>
          <pre>cd P6B{'\n'}npm install{'\n'}npm run build</pre>
          <p>
            Or run <code>npm run build:lab</code> in <code>P6A/</code> to build both into one site.
          </p>
        </div>
      )}
      {state === 'cross-origin' && (
        <div className="run-note">
          <p>
            P6B at <code>{url.origin}</code> is on a different origin, so the shared-workspace channel cannot reach it. Serve P6B
            under this site (for example at <code>/P6B/</code>).
          </p>
        </div>
      )}
    </section>
  );
}
