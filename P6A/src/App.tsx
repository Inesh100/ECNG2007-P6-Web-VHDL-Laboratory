/**
 * P6A main page, laid out like VS Code:
 *
 *   ┌ title bar: Web VHDL Laboratory · Scenarios ▾ · Reset · Run panel ────────────┐
 *   │ EXPLORER │ tabs                                  │ RUN & RESULTS — P6B        │
 *   │          │ Monaco editor (VHDL)                  │ (P6B app, reading this      │
 *   │          ├───────────────────────────────────────┤  editor's shared workspace) │
 *   │          │ PROBLEMS │ APPROVED SCENARIO │ OUTPUT │                            │
 *   ├ status bar: language service · ⓧ 0 ⚠ 0 · Ln/Col · session · rev ────────────┤
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BottomPanel, Explorer, FileTabs, StatusBar, type BottomTab, type OutputLine } from './components/Panels';
import { RunPanel } from './components/RunPanel';
import { VhdlEditor, type RevealRequest } from './editor/VhdlEditor';
import { sortProblems, summarize, type ProblemItem } from './editor/problems';
import { COUNTER_PATH, referenceFiles } from './files/referenceFiles';
import { SCENARIOS, applyScenario, scenarioCursor, type Scenario } from './languageService/scenarios';
import { LanguageClientController } from './lsp/languageClient';
import { describeLsConfig, type LsConfig } from './lsp/config';
import { STATUS_OFF, connecting, type LsStatus } from './lsp/status';
import type { WorkspaceStore } from './workspace/workspaceStore';

export interface AppProps {
  store: WorkspaceStore;
  lsConfig: LsConfig;
  /** Show the P6B run panel at start-up (default true; ?run=0 hides it). */
  showRunPanel?: boolean;
  /** Load this scenario at start-up (?scenario=LSP-02). */
  initialScenarioId?: string;
}

const now = () => new Date().toLocaleTimeString();
const referenceContents = () => Object.fromEntries(referenceFiles().map((f) => [f.path, f.content]));

export function App({ store, lsConfig, showRunPanel = true, initialScenarioId }: AppProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const fileOrder = useMemo(() => snapshot.files.map((f) => f.path), [snapshot.files]);

  const [active, setActive] = useState(COUNTER_PATH);
  const [problems, setProblems] = useState<ProblemItem[]>([]);
  const [status, setStatus] = useState<LsStatus>(lsConfig.transport === 'off' ? STATUS_OFF : connecting(describeLsConfig(lsConfig)));
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [reveal, setReveal] = useState<RevealRequest>();
  const [bottomTab, setBottomTab] = useState<BottomTab>('problems');
  const [scenario, setScenario] = useState<Scenario>();
  const [runOpen, setRunOpen] = useState(showRunPanel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorError, setEditorError] = useState<string>();
  const [output, setOutput] = useState<OutputLine[]>([{ at: now(), text: `Workspace ${snapshot.sessionId} published on IF-P6-WS-01 (revision ${snapshot.revision}).` }]);
  const log = useCallback((text: string) => setOutput((o) => [...o.slice(-199), { at: now(), text }]), []);

  // ------------------------------------------------------------ language client
  const controller = useMemo(
    () =>
      new LanguageClientController(lsConfig, (s) => {
        setStatus(s);
        log(`${s.text}${s.detail ? ` — ${s.detail}` : ''}`);
      }),
    [lsConfig, log],
  );
  useEffect(() => () => void controller.stop(), [controller]);
  const onEditorReady = useCallback(() => void controller.start(), [controller]);
  const retry = useCallback(() => void controller.restart(), [controller]);

  // ------------------------------------------------------------ diagnostics -> workspace (display only for P6B)
  const sorted = useMemo(() => sortProblems(problems, fileOrder), [problems, fileOrder]);
  useEffect(() => store.setDiagnostics(summarize(problems)), [problems, store]);
  // When the service goes away, its markers are cleared by the client; keep counts honest.
  useEffect(() => {
    if (status.state === 'unavailable' || status.state === 'off') setProblems([]);
  }, [status.state]);

  // ------------------------------------------------------------ scenarios
  const loadScenario = useCallback(
    (s: Scenario) => {
      const contents = applyScenario(referenceContents(), s);
      const changed = store.replaceContents(contents);
      setScenario(s);
      setBottomTab('scenario');
      setMenuOpen(false);
      log(`Loaded ${s.id} "${s.title}"${changed ? ` as revision ${store.getSnapshot().revision}` : ' (no change)'}.`);

      const cur = scenarioCursor(contents, s);
      const firstDiag = s.expectedDiagnostics?.[0];
      if (cur) {
        setActive(cur.path);
        setReveal({ path: cur.path, line: cur.line + 1, column: cur.character + 1, action: s.kind === 'completion' ? 'suggest' : s.kind === 'hover' ? 'hover' : undefined, nonce: Date.now() });
      } else if (firstDiag) {
        setActive(firstDiag.path);
        setReveal({ path: firstDiag.path, line: firstDiag.line, column: 1, nonce: Date.now() });
      }
    },
    [store, log],
  );

  const resetFiles = useCallback(() => {
    const changed = store.replaceContents(referenceContents());
    setScenario(undefined);
    setMenuOpen(false);
    log(changed ? `Reset to the reference files (revision ${store.getSnapshot().revision}).` : 'Files are already the reference files.');
  }, [store, log]);

  const startScenario = useRef(initialScenarioId);
  const [editorReady, setEditorReady] = useState(false);
  useEffect(() => {
    if (!editorReady || !startScenario.current) return;
    const s = SCENARIOS.find((x) => x.id === startScenario.current);
    startScenario.current = undefined;
    if (s) loadScenario(s);
  }, [editorReady, loadScenario]);

  // ------------------------------------------------------------ keyboard: Ctrl+Shift+R toggles run panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setRunOpen((v) => !v);
      }
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app${runOpen ? ' with-run' : ''}`}>
      <header className="title-bar">
        <span className="app-title">Web VHDL Laboratory</span>
        <span className="muted">P6A Editor &amp; Language Features</span>
        <div className="menu">
          <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} data-testid="scenario-menu">
            Scenarios ▾
          </button>
          {menuOpen && (
            <ul className="menu-list" role="menu">
              {SCENARIOS.map((s) => (
                <li key={s.id}>
                  <button role="menuitem" onClick={() => loadScenario(s)} data-testid={`scenario-${s.id}`}>
                    <b>{s.id}</b> <span className="muted">[{s.kind}]</span> {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="menu-btn" onClick={resetFiles} data-testid="reset-files">
          Reset files
        </button>
        <span className="spacer" />
        <button className="menu-btn" onClick={() => setRunOpen((v) => !v)} title="Ctrl+Shift+R" data-testid="toggle-run">
          {runOpen ? 'Hide' : 'Show'} Run &amp; Results ▶
        </button>
      </header>

      <div className="workbench">
        <Explorer snapshot={snapshot} active={active} problems={problems} onOpen={setActive} />
        <main className="editor-column">
          <FileTabs snapshot={snapshot} active={active} problems={problems} onOpen={setActive} />
          <div className="banners">
            {status.state === 'unavailable' && (
              <div className="banner" role="status" data-testid="ls-banner">
                ⚠ {status.text}. {status.detail}{' '}
                <button className="link-btn" onClick={retry}>
                  Retry
                </button>
              </div>
            )}
            {editorError && <div className="banner error">The editor could not start: {editorError}</div>}
          </div>
          <VhdlEditor
            store={store}
            activePath={active}
            reveal={reveal}
            onReady={() => {
              setEditorReady(true);
              onEditorReady();
            }}
            onCursor={(line, column) => setCursor({ line, column })}
            onProblems={setProblems}
            onError={setEditorError}
          />
          <BottomPanel
            tab={bottomTab}
            onTab={setBottomTab}
            problems={sorted}
            scenario={scenario}
            output={output}
            lsReady={status.state === 'ready'}
            onReveal={(p) => {
              setActive(p.path);
              setReveal({ path: p.path, line: p.line, column: p.column, nonce: Date.now() });
            }}
          />
        </main>
        {runOpen && <RunPanel onClose={() => setRunOpen(false)} />}
      </div>

      <StatusBar status={status} problems={problems} snapshot={snapshot} cursor={cursor} onRetry={retry} onProblems={() => setBottomTab('problems')} />
    </div>
  );
}
