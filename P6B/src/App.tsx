/**
 * P6B main page, laid out like VHDLive:
 *
 *   ┌ ☰ File │ file tabs ……………………………… service │ Simulate ▶ ┐
 *   │ code view (test double for P6A)          │ PROPERTIES   │
 *   ├──────────────── drag to resize ──────────┴──────────────┤
 *   │ Waveform │ Console │ Problems │ Results │ Surfer │ ⧉ Pop out │
 *   ├─────────────────────────────────────────────────────────┤
 *   │ ▶ Run │ Stop: [250][ns] │ Std │ VCD │ Example ………… rev  │
 *   └─────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobOptions, JobResult } from './contracts/hdlService';
import type { LaunchContext } from './contracts/launchResult';
import { CodeView } from './components/CodeView';
import { AboutDialog, ShortcutsDialog, WelcomeDialog } from './components/Dialogs';
import { FileMenu } from './components/FileMenu';
import { OutputPanel } from './components/OutputPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ServiceSettings, type ServiceConfig } from './components/ServiceSettings';
import { buildCompletionResult, postResult } from './launch/launch';
import { openChannel, openPopoutWindow, type OutputMessage } from './popout/channel';
import { useRunController } from './run/useRunController';
import { EmbeddedTransport } from './service/embeddedTransport';
import { HdlServiceClient } from './service/hdlServiceClient';
import { HttpTransport } from './service/transport';
import { DEFAULT_OPTIONS, HDL_CASES, type HdlCase } from './simulator/fixtures';
import { FixtureWorkspace } from './workspace/fixtureWorkspace';
import type { WorkspaceSnapshot, WorkspaceSource } from './workspace/types';

export interface AppProps {
  workspace: WorkspaceSource;
  initialService: ServiceConfig;
  launch?: { context?: LaunchContext; errors: string[] };
  initialCaseId?: string;
  autorun?: boolean;
  openWaveform?: boolean;
  showWelcome?: boolean;
  /** Tests pass their own client; normally it is built from the service settings. */
  clientFactory?: (c: ServiceConfig) => HdlServiceClient;
}

// ---------- small helpers ----------

const SERVICE_KEY = 'p6b.service';
const WELCOME_KEY = 'p6b.welcomeSeen';

export function saveServiceConfig(c: ServiceConfig) {
  try {
    localStorage.setItem(SERVICE_KEY, JSON.stringify({ mode: c.mode, url: c.url }));
  } catch {
    // storage blocked: the setting just isn't remembered
  }
}

export function loadServiceConfig(): Partial<ServiceConfig> {
  try {
    return JSON.parse(localStorage.getItem(SERVICE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true;
  }
}

function downloadText(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// One in-browser simulator for the whole page, so job ids keep counting up.
const embeddedTransport = new EmbeddedTransport();

function defaultClient(c: ServiceConfig): HdlServiceClient {
  if (c.mode === 'http') return new HdlServiceClient(new HttpTransport(c.url));
  embeddedTransport.fault = c.fault;
  return new HdlServiceClient(embeddedTransport);
}

// ---------- the page ----------

export default function App(props: AppProps) {
  const { workspace, launch, initialCaseId, autorun, openWaveform, clientFactory = defaultClient } = props;

  // Workspace state published by P6A (or the test double). P6B only reads it.
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(workspace.getSnapshot());
  useEffect(() => workspace.subscribe(setSnapshot), [workspace]);
  const fixture = workspace instanceof FixtureWorkspace ? workspace : undefined;

  const [activePath, setActivePath] = useState(snapshot.files[0]?.path ?? '');
  const [highlight, setHighlight] = useState<{ path: string; line: number }>();
  const [options, setOptions] = useState<JobOptions>(DEFAULT_OPTIONS);
  const [caseId, setCaseId] = useState<string | undefined>(initialCaseId);
  const [service, setService] = useState<ServiceConfig>(props.initialService);
  const [health, setHealth] = useState<string>();
  const [client, setClient] = useState(() => clientFactory(props.initialService));

  // Which pop-ups are open
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState<'welcome' | 'shortcuts' | 'about' | null>(props.showWelcome ? 'welcome' : null);
  const [poppedOut, setPoppedOut] = useState(false);
  const [editorHeight, setEditorHeight] = useState(52); // % of the work area for the code

  // ----- learning-tool result (P6B-FR-16) -----
  const lastJob = useRef<{ job: JobResult; revision: number; viewed: boolean }>();
  const [launchResultText, setLaunchResultText] = useState('');

  function sendLaunchResult() {
    if (!launch?.context || !lastJob.current) return;
    const { job, revision, viewed } = lastJob.current;
    const result = buildCompletionResult(launch.context, job, revision, viewed);
    const sent = postResult(result, launch.context);
    setLaunchResultText(`${result.status} (score ${result.scoreGiven})${sent ? '' : ' - no host window'}`);
  }

  const onFinished = useCallback(
    (job: JobResult, revision: number) => {
      lastJob.current = { job, revision, viewed: false };
      sendLaunchResult();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [launch],
  );

  const onWaveformViewed = useCallback(() => {
    if (lastJob.current && !lastJob.current.viewed) {
      lastJob.current.viewed = true;
      sendLaunchResult();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch]);

  // ----- running -----
  const { state: run, history, run: startRun } = useRunController(workspace, client, onFinished);

  // Refs so event handlers (keyboard, pop-out messages) always see the latest values.
  const latest = useRef({ options, run, history, revision: snapshot.revision });
  latest.current = { options, run, history, revision: snapshot.revision };

  const simulate = useCallback(() => {
    if (latest.current.run.phase !== 'running') startRun(latest.current.options);
  }, [startRun]);

  function loadCase(c: HdlCase) {
    fixture?.load(c.files, c.top);
    setOptions(c.options);
    setCaseId(c.id);
    setHighlight(undefined);
  }

  function gotoLine(file: string, line: number) {
    const match = snapshot.files.find((f) => f.path === file || f.path.endsWith('/' + file) || file.endsWith(f.path));
    if (!match) return;
    setActivePath(match.path);
    setHighlight({ path: match.path, line });
  }

  // Start-up: optional case and autorun (used by the launch/result harness).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const c = HDL_CASES.find((x) => x.id === initialCaseId);
    if (c) loadCase(c);
    if (autorun && !launch?.errors.length) setTimeout(() => startRun(c?.options ?? DEFAULT_OPTIONS), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the selected file valid if the file list changes.
  useEffect(() => {
    if (!snapshot.files.some((f) => f.path === activePath)) setActivePath(snapshot.files[0]?.path ?? '');
  }, [snapshot, activePath]);

  // ----- pop-out window -----
  const channel = useRef<BroadcastChannel>();
  const popoutWindow = useRef<Window | null>(null);

  function sendStateToPopout() {
    channel.current?.postMessage({ type: 'state', state: { run: latest.current.run, history: latest.current.history, currentRevision: latest.current.revision } } satisfies OutputMessage);
  }

  useEffect(() => {
    const ch = openChannel();
    channel.current = ch;
    if (!ch) return;
    ch.onmessage = (event: MessageEvent<OutputMessage>) => {
      const msg = event.data;
      if (msg.type === 'hello') {
        setPoppedOut(true);
        sendStateToPopout();
      }
      if (msg.type === 'bye') setPoppedOut(false);
      if (msg.type === 'run') simulate();
      if (msg.type === 'goto') gotoLine(msg.file, msg.line);
      if (msg.type === 'waveformViewed') onWaveformViewed();
    };
    return () => ch.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulate, onWaveformViewed, snapshot]);

  // Whenever the output changes, send it to the pop-out.
  useEffect(() => {
    if (poppedOut) sendStateToPopout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, history, snapshot.revision, poppedOut]);

  // If the user closes the pop-out window with the X, bring the output back.
  useEffect(() => {
    if (!poppedOut) return;
    const timer = setInterval(() => {
      if (popoutWindow.current && popoutWindow.current.closed) setPoppedOut(false);
    }, 1000);
    return () => clearInterval(timer);
  }, [poppedOut]);

  function popOut() {
    popoutWindow.current = openPopoutWindow();
    if (popoutWindow.current) setPoppedOut(true);
  }

  function dock() {
    popoutWindow.current?.close();
    setPoppedOut(false);
  }

  // ----- keyboard shortcuts -----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        simulate();
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (poppedOut) dock();
        else popOut();
      }
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSettingsOpen(false);
        setDialog(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulate, poppedOut]);

  // ----- drag the divider between code and output -----
  const work = useRef<HTMLDivElement>(null);
  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    const onMove = (m: MouseEvent) => {
      const box = work.current!.getBoundingClientRect();
      const percent = ((m.clientY - box.top) / box.height) * 100;
      setEditorHeight(Math.min(85, Math.max(15, percent)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function checkHealth() {
    setHealth('checking…');
    try {
      const h = await client.health();
      setHealth(`OK · ${h.implementation ?? 'service'} · contract ${h.contractVersion ?? '?'}`);
    } catch (e) {
      setHealth(`Unreachable: ${(e as Error).message}`);
    }
  }

  const activeFile = snapshot.files.find((f) => f.path === activePath) ?? snapshot.files[0];
  const vcd = run.job?.artefacts.find((a) => a.kind === 'vcd');
  const serviceLabel = service.mode === 'embedded' ? `Browser sim${service.fault !== 'none' ? ` · fault: ${service.fault}` : ''}` : service.url;

  return (
    <div className="vl" data-testid="app">
      {/* ---------- top bar ---------- */}
      <header className="topbar">
        <button className="vbtn file-btn" onClick={() => setMenuOpen(!menuOpen)} data-testid="file-button">☰ File</button>
        {menuOpen && (
          <FileMenu
            canEdit={!!fixture}
            currentFile={activeFile?.path ?? ''}
            hasVcd={!!vcd?.content}
            onClose={() => setMenuOpen(false)}
            onLoadCase={loadCase}
            onReset={() => { fixture?.reset(); setCaseId(undefined); setOptions(DEFAULT_OPTIONS); }}
            onDownloadFile={() => activeFile && downloadText(activeFile.path.split('/').pop()!, activeFile.content)}
            onDownloadVcd={() => vcd?.content && downloadText(vcd.name, vcd.content)}
            onSettings={() => setSettingsOpen(true)}
            onShortcuts={() => setDialog('shortcuts')}
            onAbout={() => setDialog('about')}
            onWelcome={() => setDialog('welcome')}
          />
        )}

        <nav className="file-tabs" role="tablist">
          {snapshot.files.map((f) => (
            <button key={f.path} role="tab" aria-selected={f.path === activeFile?.path} className={`file-tab ${f.path === activeFile?.path ? 'active' : ''}`} onClick={() => setActivePath(f.path)}>
              {f.path.split('/').pop()}
            </button>
          ))}
        </nav>

        <span className="spacer" />
        <span className="brand">VHDL Lab <b>P6B</b></span>
        {launch && (
          <span className={`vchip ${launch.errors.length ? 'bad' : 'ok'}`} data-testid="launch-pill" title={launch.errors.join('; ')}>
            {launch.errors.length ? `Launch rejected: ${launch.errors[0]}` : `Launched · ${launch.context!.activityId}`}
            {launchResultText && !launch.errors.length && <> · result: <b data-testid="launch-result">{launchResultText}</b></>}
          </span>
        )}
        <button className="vchip link" onClick={() => setSettingsOpen(true)} data-testid="service-pill" title="Change simulation service">
          <span className={`led ${service.mode === 'http' ? 'net' : service.fault === 'none' ? 'ok' : 'warn'}`} /> {serviceLabel}
        </button>
        <button className="simulate" onClick={simulate} disabled={run.phase === 'running'} data-testid="run-button" title="Simulate (Ctrl+Enter)">
          {run.phase === 'running' ? 'Running…' : 'Simulate ▶'}
        </button>
      </header>

      {launch?.errors.length ? (
        <div className="vnote bad" role="alert"><b>This launch could not be accepted.</b> {launch.errors.join('; ')}. You can still use the lab, but no result will be sent back.</div>
      ) : null}

      {/* ---------- work area ---------- */}
      <div className="work" ref={work}>
        <div className="top-row" style={poppedOut ? { flex: 1 } : { height: `${editorHeight}%` }}>
          <div className="editor">
            {activeFile && (
              <CodeView
                path={activeFile.path}
                content={activeFile.content}
                editable={!!fixture}
                onChange={(text) => fixture?.updateFile(activeFile.path, text)}
                highlightLine={highlight?.path === activeFile.path ? highlight.line : undefined}
              />
            )}
          </div>
          <PropertiesPanel snapshot={snapshot} standard={options.vhdlStandard} workspaceLabel={workspace.label} isTestDouble={workspace.isTestDouble} />
        </div>

        {!poppedOut && (
          <>
            <div className="splitter" onMouseDown={startDrag} title="Drag to resize" />
            <div className="bottom-row" style={{ height: `${100 - editorHeight}%` }}>
              <OutputPanel
                run={run}
                history={history}
                currentRevision={snapshot.revision}
                onRerun={simulate}
                onGoto={gotoLine}
                onWaveformViewed={onWaveformViewed}
                onPopout={popOut}
                openSurferOnSuccess={openWaveform}
              />
            </div>
          </>
        )}
        {poppedOut && (
          <div className="popped-note" data-testid="popped-note">
            Output is open in a separate window. <button className="vbtn sm" onClick={dock}>⇲ Bring it back</button>
          </div>
        )}
      </div>

      {/* ---------- bottom run bar ---------- */}
      <footer className="runbar">
        <button className="vbtn run" onClick={simulate} disabled={run.phase === 'running'}>▶ Run</button>
        <span className="runbar-sep" />
        <label>Stop: <input className="mono" size={6} value={options.stopTime.replace(/[a-z]+$/i, '')} onChange={(e) => setOptions({ ...options, stopTime: e.target.value + (options.stopTime.match(/[a-z]+$/i)?.[0] ?? 'ns') })} data-testid="opt-stoptime" /></label>
        <select value={options.stopTime.match(/[a-z]+$/i)?.[0] ?? 'ns'} onChange={(e) => setOptions({ ...options, stopTime: options.stopTime.replace(/[a-z]+$/i, '') + e.target.value })}>
          {['ps', 'ns', 'us', 'ms'].map((u) => <option key={u}>{u}</option>)}
        </select>
        <span className="runbar-sep" />
        <label>Std:
          <select value={options.vhdlStandard} onChange={(e) => setOptions({ ...options, vhdlStandard: e.target.value as JobOptions['vhdlStandard'] })}>
            <option value="08">VHDL-2008</option>
            <option value="93">VHDL-93</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={options.waveform === 'vcd'} onChange={(e) => setOptions({ ...options, waveform: e.target.checked ? 'vcd' : 'none' })} data-testid="opt-vcd" /> VCD</label>
        {fixture && (
          <>
            <span className="runbar-sep" />
            <label>Example:
              <select value={caseId ?? ''} onChange={(e) => { const c = HDL_CASES.find((x) => x.id === e.target.value); if (c) loadCase(c); }} data-testid="case-select">
                <option value="" disabled>choose…</option>
                {HDL_CASES.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
              </select>
            </label>
          </>
        )}
        <span className="spacer" />
        <span className="muted small">ECNG 2007 · Group 6 · P6B</span>
      </footer>

      {/* ---------- pop-ups ---------- */}
      {settingsOpen && (
        <ServiceSettings
          config={service}
          health={health}
          onCheck={checkHealth}
          onClose={() => setSettingsOpen(false)}
          onChange={(c) => {
            setService(c);
            setClient(clientFactory(c));
            saveServiceConfig(c);
            setHealth(undefined);
            setSettingsOpen(false);
          }}
        />
      )}
      {dialog === 'welcome' && (
        <WelcomeDialog
          onClose={() => setDialog(null)}
          onNever={() => {
            try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
            setDialog(null);
          }}
        />
      )}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'about' && <AboutDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
