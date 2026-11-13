/**
 * Local launch/result harness (P6B-FR-17, P6B-IR-06, P6-AC2.2).
 *
 * Plays the role Project 7 would play: launches the lab with each published
 * example context, receives the normalised completion/result over
 * postMessage and checks it against the expected values. Project 7 is not
 * required.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateCompletionResult, type CompletionResult, type LaunchContext } from '../contracts/launchResult';
import { LAUNCH_EXAMPLES, type LaunchExample } from '../launch/examples';
import { encodeLaunch } from '../launch/launch';
import '../styles.css';

type Verdict = 'idle' | 'running' | 'pass' | 'fail';
interface Outcome {
  verdict: Verdict;
  results: CompletionResult[];
  note?: string;
}

const LAB = `${import.meta.env.BASE_URL}index.html`;

function labUrl(ex: LaunchExample): string {
  const ctx = { ...(ex.context as LaunchContext), returnOrigin: window.location.origin };
  const p = new URLSearchParams({ launch: encodeLaunch(ctx as LaunchContext), case: ex.caseId, autorun: '1', openWaveform: ex.viewWaveform ? '1' : '0', workspace: 'fixture' });
  return `${LAB}?${p.toString()}`;
}

function check(ex: LaunchExample, results: CompletionResult[]): { done: boolean; pass: boolean; note: string } {
  if (!ex.expected.accepted) {
    return results.length ? { done: true, pass: false, note: 'A result was returned for a launch that should be rejected' } : { done: false, pass: false, note: '' };
  }
  const last = results[results.length - 1];
  if (!last) return { done: false, pass: false, note: '' };
  const problems = validateCompletionResult(last);
  if (problems.length) return { done: true, pass: false, note: `Result breaks the contract: ${problems.join('; ')}` };
  const ctx = ex.context as LaunchContext;
  if (last.launchId !== ctx.launchId || last.activityId !== ctx.activityId || last.learnerId !== ctx.learnerId)
    return { done: true, pass: false, note: 'Result is not associated with the launch that produced it' };
  if (last.status === ex.expected.status && last.scoreGiven === ex.expected.scoreGiven)
    return { done: true, pass: true, note: `status ${last.status}, score ${last.scoreGiven}, job ${last.evidence.jobId}` };
  return { done: false, pass: false, note: `latest: ${last.status} (${last.scoreGiven})` };
}

function Harness() {
  const [active, setActive] = useState<LaunchExample>();
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [frameKey, setFrameKey] = useState(0);
  const queue = useRef<LaunchExample[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const activeRef = useRef<LaunchExample>();
  activeRef.current = active;

  const finish = (ex: LaunchExample, verdict: Verdict, note: string) => {
    clearTimeout(timer.current);
    setOutcomes((o) => ({ ...o, [ex.id]: { ...(o[ex.id] ?? { results: [] }), verdict, note } }));
    const next = queue.current.shift();
    if (next) setTimeout(() => start(next), 400);
  };

  const start = (ex: LaunchExample) => {
    setActive(ex);
    setFrameKey((k) => k + 1);
    setOutcomes((o) => ({ ...o, [ex.id]: { verdict: 'running', results: [] } }));
    clearTimeout(timer.current);
    const wait = ex.expected.accepted ? (ex.viewWaveform ? 45000 : 15000) : 5000;
    timer.current = setTimeout(() => {
      if (!ex.expected.accepted) finish(ex, 'pass', 'No result returned; the lab rejected the launch as required');
      else finish(ex, 'fail', 'Timed out waiting for the expected result');
    }, wait);
  };

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { type?: string; result?: CompletionResult };
      const ex = activeRef.current;
      if (d?.type !== 'p6b.result' || !d.result || !ex) return;
      setOutcomes((o) => {
        const prev = o[ex.id] ?? { verdict: 'running' as Verdict, results: [] };
        const results = [...prev.results, d.result!];
        const c = check(ex, results);
        if (c.done) setTimeout(() => finish(ex, c.pass ? 'pass' : 'fail', c.note), 0);
        return { ...o, [ex.id]: { ...prev, results, note: c.note || prev.note } };
      });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAll = () => {
    queue.current = LAUNCH_EXAMPLES.slice(1);
    start(LAUNCH_EXAMPLES[0]);
  };
  const passed = Object.values(outcomes).filter((o) => o.verdict === 'pass').length;

  return (
    <div className="app harness">
      <header className="topbar">
        <div className="brand">
          <div>
            <h1>Launch/Result Harness</h1>
            <p>Local stand-in for Project 7 · Learning Tool Launch/Result Contract v1</p>
          </div>
        </div>
        <div className="top-meta">
          <span className="pill" data-testid="harness-score">{passed}/{LAUNCH_EXAMPLES.length} passed</span>
          <button className="btn btn-run" onClick={runAll} data-testid="run-all">Run all examples</button>
          <a className="btn btn-ghost" href={LAB}>Back to lab</a>
        </div>
      </header>
      <main className="layout harness-layout">
        <section className="panel">
          <header className="panel-head"><div><h2>Published examples</h2><p className="sub">Each example launches the lab in the frame on the right and waits for its result.</p></div></header>
          <ul className="examples">
            {LAUNCH_EXAMPLES.map((ex) => {
              const o = outcomes[ex.id];
              return (
                <li key={ex.id} className={`example ${active?.id === ex.id ? 'current' : ''}`} data-testid={`example-${ex.id}`} data-verdict={o?.verdict ?? 'idle'}>
                  <div className="ex-head">
                    <span className="mono">{ex.id}</span>
                    <b>{ex.title}</b>
                    <span className="spacer" />
                    <span className={`badge badge-sm verdict-${o?.verdict ?? 'idle'}`}>{o?.verdict ?? 'not run'}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => start(ex)}>Run</button>
                  </div>
                  <p className="muted small">
                    Case {ex.caseId} · rule {(ex.context as LaunchContext).completion?.rule}
                    {' · expects '}
                    {ex.expected.accepted ? `${ex.expected.status} / score ${ex.expected.scoreGiven}` : 'launch rejected, no result'}
                  </p>
                  {o?.note && <p className="small">{o.note}</p>}
                  {o?.results.length ? (
                    <details>
                      <summary>{o.results.length} result message(s) received</summary>
                      <pre className="console small">{JSON.stringify(o.results[o.results.length - 1], null, 2)}</pre>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel lab-frame-panel">
          <header className="panel-head"><div><h2>Lab under test</h2><p className="sub">{active ? `${active.id} launched` : 'Run an example to launch the lab here.'}</p></div></header>
          {active ? <iframe key={frameKey} className="lab-frame" title="Web VHDL Lab under test" src={labUrl(active)} data-testid="lab-frame" /> : <div className="empty">Nothing launched yet.</div>}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
