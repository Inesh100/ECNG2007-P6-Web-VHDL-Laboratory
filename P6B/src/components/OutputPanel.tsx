/**
 * The bottom output panel, modelled on VHDLive: tabs for Waveform, Console,
 * Problems, Results and Surfer, with the run status on the same bar.
 * The same component is used in the main page and in the pop-out window.
 *
 * Requirements: P6B-FR-05..14, P6B-UR-01..03.
 */
import { useEffect, useState } from 'react';
import type { LogEntry, ToolDiagnostic } from '../contracts/hdlService';
import { CATEGORY_HELP, CATEGORY_LABEL, hasWaveform, PIPELINE, pipelineStates } from '../run/runModel';
import type { HistoryItem, RunState } from '../run/useRunController';
import { openSurferWindow, SurferViewer } from '../surfer/SurferViewer';
import { WaveformView } from './WaveformView';

type Tab = 'waveform' | 'console' | 'problems' | 'results' | 'surfer';

interface Props {
  run: RunState;
  history: HistoryItem[];
  currentRevision: number;
  isPopout?: boolean;
  onRerun: () => void;
  onGoto: (file: string, line: number) => void;
  onWaveformViewed: () => void;
  onPopout?: () => void; // main page: open the pop-out window
  onDock?: () => void; // pop-out: go back into the main page
  openSurferOnSuccess?: boolean;
}

const STEP_NAMES: Record<string, string> = { analysis: 'Analysis', elaboration: 'Elaboration', simulation: 'Simulation', completed: 'Done' };

export function OutputPanel(props: Props) {
  const { run, history, currentRevision, isPopout, onRerun, onGoto, onWaveformViewed, onPopout, onDock, openSurferOnSuccess } = props;
  const [tab, setTab] = useState<Tab>('waveform');

  const job = run.job;
  const waveformReady = hasWaveform(job);
  const vcd = job?.artefacts.find((a) => a.kind === 'vcd');
  const diagnostics: ToolDiagnostic[] = job?.failure?.diagnostics ?? [];
  const steps = pipelineStates(run.stage, run.phase === 'idle' ? 'idle' : run.status, job?.failure?.category);
  const stale = run.phase === 'done' && run.submittedRevision !== currentRevision;
  const topScope = (run.submittedTop ?? 'tb').toLowerCase();

  // After each run, open the most useful tab (and never leave a disabled tab open: P6B-FR-14).
  useEffect(() => {
    if (run.phase !== 'done') return;
    if (job?.status === 'failed') setTab(diagnostics.length > 0 ? 'problems' : 'console');
    else if (waveformReady) setTab(openSurferOnSuccess ? 'surfer' : 'waveform');
    else setTab('results');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.phase, job?.jobId]);

  return (
    <section className={`output ${isPopout ? 'is-popout' : ''}`} aria-label="Simulation output">
      <div className="out-bar">
        <div className="out-tabs" role="tablist">
          <TabButton id="waveform" tab={tab} setTab={setTab} disabled={!waveformReady} title={waveformReady ? '' : 'No VCD waveform was returned for this run'}>Waveform</TabButton>
          <TabButton id="console" tab={tab} setTab={setTab} count={run.logs.length}>Console</TabButton>
          <TabButton id="problems" tab={tab} setTab={setTab} count={diagnostics.length} warn>Problems</TabButton>
          <TabButton id="results" tab={tab} setTab={setTab}>Results</TabButton>
          <TabButton id="surfer" tab={tab} setTab={setTab} disabled={!waveformReady} title={waveformReady ? 'View in Surfer' : 'No VCD waveform was returned for this run'}>Surfer</TabButton>
          <button className="out-tab link" disabled={!waveformReady || !vcd?.content} onClick={() => vcd?.content && openSurferWindow(vcd.content, topScope)} title="Open Surfer in a new window">Surfer ↗</button>
        </div>

        <StatusText run={run} />

        <span className="spacer" />
        <button className="vbtn" onClick={onRerun} disabled={run.phase === 'running'} data-testid="rerun-button">↻ Re-run</button>
        <span className="vbtn static" title="Runs this session">▦ Runs ({history.length})</span>
        {onPopout && <button className="vbtn" onClick={onPopout} data-testid="popout-button" title="Show the output in its own window">⧉ Pop out</button>}
        {onDock && <button className="vbtn" onClick={onDock} data-testid="dock-button" title="Put the output back in the lab window">⇲ Dock</button>}
      </div>

      <StageStrip steps={steps} running={run.phase === 'running'} />
      <Banner run={run} stale={stale} />

      <div className="out-body">
        {tab === 'waveform' && (waveformReady && vcd?.content ? <WaveformView vcd={vcd.content} /> : <Empty text="No waveform data — click Simulate ▶" />)}
        {tab === 'console' && <ConsoleView logs={run.logs} onGoto={onGoto} />}
        {tab === 'problems' && <ProblemsView diagnostics={diagnostics} hasJob={!!job} succeeded={job?.status === 'succeeded'} onGoto={onGoto} />}
        {tab === 'results' && <ResultsView run={run} history={history} />}
        {tab === 'surfer' && waveformReady && vcd?.content && <SurferViewer vcd={vcd.content} name={vcd.name} topScope={topScope} onLoaded={onWaveformViewed} />}
      </div>
    </section>
  );
}

function TabButton(props: { id: Tab; tab: Tab; setTab: (t: Tab) => void; children: React.ReactNode; count?: number; warn?: boolean; disabled?: boolean; title?: string }) {
  const { id, tab, setTab, children, count, warn, disabled, title } = props;
  return (
    <button role="tab" aria-selected={tab === id} disabled={disabled} title={title} className={`out-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} data-testid={`tab-${id}`}>
      {children}
      {count !== undefined && count > 0 && <span className={`out-count ${warn ? 'warn' : ''}`}>{count}</span>}
    </button>
  );
}

/** The short status text next to the tabs, like VHDLive's "— Done — 8 signals …". */
function StatusText({ run }: { run: RunState }) {
  if (run.phase === 'idle') return <span className="out-status muted">Click Simulate ▶ to run</span>;
  if (run.phase === 'running') return <span className="out-status running"><span className="spin" /> {run.stage}…{run.channel ? ` (${run.channel})` : ''}</span>;
  const job = run.job!;
  const secs = run.startedAt && run.finishedAt ? ((run.finishedAt - run.startedAt) / 1000).toFixed(1) : '?';
  if (job.status === 'succeeded') {
    const vcd = job.artefacts.find((a) => a.kind === 'vcd');
    const signals = vcd?.content ? (vcd.content.match(/\$var /g) ?? []).length : 0;
    return <span className="out-status ok">— Done — {signals} signals ({secs}s total) <span className="vchip">rev {run.submittedRevision}</span></span>;
  }
  return <span className="out-status bad">— Failed at {job.failure!.category === 'service' ? 'service' : job.stage} ({secs}s)</span>;
}

/** Analysis › Elaboration › Simulation › Done, each with a tick, cross or dash. */
function StageStrip({ steps, running }: { steps: Record<string, string>; running: boolean }) {
  const icon: Record<string, string> = { passed: '✓', failed: '✕', skipped: '–', active: '…', pending: '○' };
  return (
    <ol className="stages" data-testid="pipeline" aria-label="Job stages">
      {PIPELINE.map((s, i) => (
        <li key={s} className={`stage ${steps[s]}`} data-testid={`step-${s}`} data-state={steps[s]}>
          <span className="stage-icon">{steps[s] === 'active' && running ? <span className="spin" /> : icon[steps[s]]}</span>
          {STEP_NAMES[s]}
          {i < PIPELINE.length - 1 && <span className="stage-sep">›</span>}
        </li>
      ))}
    </ol>
  );
}

/** Success or failure message with the explicit category label (P6B-UR-01). */
function Banner({ run, stale }: { run: RunState; stale: boolean }) {
  const job = run.job;
  if (run.phase === 'idle') return <div className="banner idle" data-testid="status-banner">Ready. Press <b>Simulate ▶</b> (or Ctrl+Enter) to run the current files.</div>;
  if (run.phase === 'running') return <div className="banner running" data-testid="status-banner" aria-live="polite"><span className="spin" /> <b>Running</b> <span className="muted">· stage: {run.stage}{run.jobId ? ` · job ${run.jobId}` : ''}</span></div>;
  if (!job) return null;

  const staleNote = stale && <span className="stale">Files changed since this run. Simulate again to check them.</span>;

  if (job.status === 'succeeded') {
    return (
      <div className="banner success" data-testid="status-banner" aria-live="polite">
        <span className="badge success" data-testid="result-status">Succeeded</span>
        <span>{job.result?.summary}</span>
        {staleNote}
      </div>
    );
  }
  const category = job.failure!.category;
  return (
    <div className={`banner ${category}`} data-testid="status-banner" aria-live="assertive">
      <span className={`badge ${category}`} data-testid="failure-category" data-category={category}>{CATEGORY_LABEL[category]}</span>
      <span className="failure-msg" data-testid="failure-message">{job.failure!.message}</span>
      <span className="help">{CATEGORY_HELP[category]}</span>
      {staleNote}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

/** Log lines. Lines that mention "file.vhd:line" can be clicked to jump to the source. */
function ConsoleView({ logs, onGoto }: { logs: LogEntry[]; onGoto: (file: string, line: number) => void }) {
  const [errorsOnly, setErrorsOnly] = useState(false);
  if (logs.length === 0) return <Empty text="No report messages — simulation output will appear here" />;
  const shown = errorsOnly ? logs.filter((l) => l.stream === 'stderr') : logs;

  return (
    <div className="console-wrap">
      <div className="console-tools">
        <label className="check"><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> errors only</label>
        <span className="spacer" />
        <button className="vbtn sm" onClick={() => navigator.clipboard?.writeText(logs.map((l) => `[${l.stage}] ${l.text}`).join('\n'))}>Copy</button>
      </div>
      <pre className="console" data-testid="logs">
        {shown.map((l, i) => {
          const where = l.text.match(/([\w/]+\.vhdl?):(\d+)/);
          return (
            <div key={i} className={`cline ${l.stream} ${where ? 'clickable' : ''}`} onClick={where ? () => onGoto(where[1], parseInt(where[2], 10)) : undefined}>
              <span className={`ctag ${l.stage}`}>{l.stage}</span>
              <span>{l.text}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function ProblemsView(props: { diagnostics: ToolDiagnostic[]; hasJob: boolean; succeeded: boolean; onGoto: (file: string, line: number) => void }) {
  const { diagnostics, hasJob, succeeded, onGoto } = props;
  if (!hasJob) return <Empty text="Run a simulation to see problems reported by the service." />;
  if (diagnostics.length === 0) return <Empty text={succeeded ? 'No problems reported.' : 'The service gave no source location for this failure. See Console.'} />;
  return (
    <ul className="problems" data-testid="problems">
      {diagnostics.map((d, i) => (
        <li key={i} className={`problem ${d.severity}`} onClick={() => d.file && d.line && onGoto(d.file, d.line)} title={d.file && d.line ? 'Click to show this line' : ''}>
          <span className="sev">{d.severity}</span>
          <span className="msg">{d.message}</span>
          {d.file && <span className="loc mono">{d.file}{d.line ? `:${d.line}` : ''}{d.column ? `:${d.column}` : ''}</span>}
        </li>
      ))}
    </ul>
  );
}

function ResultsView({ run, history }: { run: RunState; history: HistoryItem[] }) {
  const job = run.job;
  if (!job) return <Empty text="No results yet." />;
  const r = job.result;
  const vcd = job.artefacts.find((a) => a.kind === 'vcd');

  return (
    <div className="results" data-testid="results">
      <table className="kv">
        <tbody>
          <tr><th>Job</th><td className="mono">{job.jobId}</td><th>Status</th><td>{job.status}</td></tr>
          <tr><th>Final stage</th><td>{job.stage}</td><th>Revision run</th><td>{run.submittedRevision}</td></tr>
          <tr><th>Simulated to</th><td>{r?.simulatedTime ?? '—'}</td><th>Exit code</th><td>{r?.exitCode ?? '—'}</td></tr>
          <tr>
            <th>Waveform</th>
            <td colSpan={3} data-testid="waveform-availability">{vcd && job.status === 'succeeded' ? `${vcd.name} (${vcd.sizeBytes ?? vcd.content?.length ?? 0} bytes)` : 'not produced for this run'}</td>
          </tr>
        </tbody>
      </table>

      {r?.reports && r.reports.length > 0 && (
        <>
          <h4>Testbench reports</h4>
          <ul className="reports">
            {r.reports.map((rep, i) => (
              <li key={i} className={rep.severity}><span className="sev">{rep.severity}</span> <span className="mono muted">@{rep.time}</span> {rep.message}</li>
            ))}
          </ul>
        </>
      )}

      {history.length > 0 && (
        <>
          <h4>Runs this session</h4>
          <table className="history">
            <thead><tr><th>Time</th><th>Rev</th><th>Outcome</th><th>Job</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.jobId}>
                  <td>{h.at}</td>
                  <td>{h.revision}</td>
                  <td><span className={`badge sm ${h.status === 'succeeded' ? 'success' : h.category}`}>{h.status === 'succeeded' ? 'Succeeded' : CATEGORY_LABEL[h.category as keyof typeof CATEGORY_LABEL]}</span></td>
                  <td className="mono muted">{h.jobId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
