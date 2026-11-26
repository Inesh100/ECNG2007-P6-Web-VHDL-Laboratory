/**
 * VS Code-style chrome around the editor: explorer, file tabs, Problems /
 * Scenario / Output panel and status bar (P6A-UR-1, P6A-DC-04).
 */
import type { WorkspaceSnapshot } from '../workspace/types';
import type { ProblemItem } from '../editor/problems';
import type { LsStatus } from '../lsp/status';
import type { Scenario } from '../languageService/scenarios';

const fileName = (path: string) => path.split('/').pop() ?? path;

// ------------------------------------------------------------------ explorer

export function Explorer({ snapshot, active, problems, onOpen }: { snapshot: WorkspaceSnapshot; active: string; problems: ProblemItem[]; onOpen: (path: string) => void }) {
  const folders = [...new Set(snapshot.files.map((f) => f.path.split('/').slice(0, -1).join('/')))];
  return (
    <nav className="explorer" aria-label="Explorer">
      <div className="panel-title">EXPLORER</div>
      <div className="tree-root">▾ P6-WEB-VHDL-LAB</div>
      {folders.map((folder) => (
        <div key={folder}>
          <div className="tree-folder">▾ {folder}</div>
          {snapshot.files
            .filter((f) => f.path.startsWith(folder + '/'))
            .map((f) => {
              const errs = problems.filter((p) => p.path === f.path && p.severity === 'error').length;
              const warns = problems.filter((p) => p.path === f.path && p.severity === 'warning').length;
              return (
                <button key={f.path} className={`tree-file${f.path === active ? ' active' : ''}${errs ? ' has-errors' : warns ? ' has-warnings' : ''}`} onClick={() => onOpen(f.path)} title={`${f.path} (${f.role})`}>
                  <span className="file-icon">◆</span>
                  {fileName(f.path)}
                  {errs + warns > 0 && <span className="tree-count">{errs + warns}</span>}
                </button>
              );
            })}
        </div>
      ))}
      <div className="explorer-note">Fixed file model: design + testbench. Top-level: {snapshot.top}</div>
    </nav>
  );
}

// ------------------------------------------------------------------ tabs

export function FileTabs({ snapshot, active, problems, onOpen }: { snapshot: WorkspaceSnapshot; active: string; problems: ProblemItem[]; onOpen: (path: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {snapshot.files.map((f) => {
        const errs = problems.some((p) => p.path === f.path && p.severity === 'error');
        return (
          <button key={f.path} role="tab" aria-selected={f.path === active} className={`tab${f.path === active ? ' active' : ''}${errs ? ' has-errors' : ''}`} onClick={() => onOpen(f.path)} title={f.path} data-testid={`tab-${f.path}`}>
            {fileName(f.path)}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ bottom panel

export type BottomTab = 'problems' | 'scenario' | 'output';

export interface OutputLine {
  at: string;
  text: string;
}

export function BottomPanel(props: {
  tab: BottomTab;
  onTab: (t: BottomTab) => void;
  problems: ProblemItem[];
  scenario?: Scenario;
  output: OutputLine[];
  lsReady: boolean;
  onReveal: (p: ProblemItem) => void;
}) {
  const { tab, onTab, problems } = props;
  return (
    <section className="bottom-panel">
      <div className="bottom-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'problems'} className={tab === 'problems' ? 'active' : ''} onClick={() => onTab('problems')}>
          PROBLEMS {problems.length > 0 && <span className="badge">{problems.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'scenario'} className={tab === 'scenario' ? 'active' : ''} onClick={() => onTab('scenario')}>
          APPROVED SCENARIO
        </button>
        <button role="tab" aria-selected={tab === 'output'} className={tab === 'output' ? 'active' : ''} onClick={() => onTab('output')}>
          OUTPUT
        </button>
      </div>
      <div className="bottom-body">
        {tab === 'problems' && <ProblemsList problems={problems} onReveal={props.onReveal} />}
        {tab === 'scenario' && <ScenarioCheck scenario={props.scenario} problems={problems} lsReady={props.lsReady} />}
        {tab === 'output' && (
          <ul className="output-list">
            {props.output.map((l, i) => (
              <li key={i}>
                <span className="muted">[{l.at}]</span> {l.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ProblemsList({ problems, onReveal }: { problems: ProblemItem[]; onReveal: (p: ProblemItem) => void }) {
  if (problems.length === 0) return <div className="muted pad" data-testid="no-problems">No problems have been detected in the workspace.</div>;
  return (
    <ul className="problems" data-testid="problems">
      {problems.map((p, i) => (
        <li key={i}>
          <button className={`problem ${p.severity}`} onClick={() => onReveal(p)}>
            <span className="sev-icon">{p.severity === 'error' ? 'ⓧ' : p.severity === 'warning' ? '⚠' : 'ⓘ'}</span>
            <span className="problem-msg">{p.message}</span>
            <span className="muted">
              {p.source ?? ''} {p.code ? `(${p.code})` : ''} {p.path} [Ln {p.line}, Col {p.column}]
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Live comparison of the displayed Problems with the approved response. */
function ScenarioCheck({ scenario, problems, lsReady }: { scenario?: Scenario; problems: ProblemItem[]; lsReady: boolean }) {
  if (!scenario) return <div className="muted pad">Choose a scenario from the Scenarios menu to load it and see its approved response here.</div>;
  if (scenario.kind !== 'diagnostics') {
    return (
      <div className="pad">
        <b>{scenario.id}</b> {scenario.title}
        <p>
          {scenario.kind === 'completion' ? (
            <>
              The completion list at the cursor must include: <code>{(scenario.expectedCompletions ?? []).join(', ')}</code>
              {scenario.unexpectedCompletions?.length ? (
                <>
                  {' '}
                  and must not include: <code>{scenario.unexpectedCompletions.join(', ')}</code>
                </>
              ) : null}
              . Press <kbd>Ctrl</kbd>+<kbd>Space</kbd> if the list is closed.
            </>
          ) : (
            <>
              Hovering the word at the cursor must show: <code>{scenario.expectedHover}</code>
            </>
          )}
        </p>
      </div>
    );
  }
  const expected = scenario.expectedDiagnostics ?? [];
  const key = (path: string, line: number, sev: string, msg: string) => `${path}:${line}:${sev}:${msg}`;
  const shown = new Set(problems.map((p) => key(p.path, p.line, p.severity, p.message)));
  const wanted = new Set(expected.map((e) => key(e.path, e.line, e.severity, e.message)));
  const match = lsReady && expected.length === problems.length && [...wanted].every((k) => shown.has(k));
  return (
    <div className="pad">
      <div>
        <b>{scenario.id}</b> {scenario.title}{' '}
        <span className={match ? 'pass' : 'fail'} data-testid="scenario-result">
          {lsReady ? (match ? '✔ matches the approved response' : '✖ does not match yet') : '… waiting for the language service'}
        </span>
      </div>
      {expected.length === 0 ? (
        <p>Approved response: no problems.</p>
      ) : (
        <ul className="problems">
          {expected.map((e, i) => (
            <li key={i} className={shown.has(key(e.path, e.line, e.severity, e.message)) ? 'pass' : 'fail'}>
              {e.severity === 'error' ? 'ⓧ' : '⚠'} {e.message} <span className="muted">{e.path} [Ln {e.line}]</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ status bar

export function StatusBar(props: { status: LsStatus; problems: ProblemItem[]; snapshot: WorkspaceSnapshot; cursor: { line: number; column: number }; onRetry: () => void; onProblems: () => void }) {
  const { status, snapshot } = props;
  const errors = props.problems.filter((p) => p.severity === 'error').length;
  const warnings = props.problems.filter((p) => p.severity === 'warning').length;
  return (
    <footer className={`status-bar ls-${status.state}`}>
      <span className="status-item" title={status.detail} data-testid="ls-status" data-state={status.state}>
        {status.state === 'ready' ? '✓' : status.state === 'connecting' ? '⟳' : status.state === 'off' ? '○' : '⚠'} {status.text}
      </span>
      {status.canRetry && (
        <button className="status-item status-btn" onClick={props.onRetry} data-testid="ls-retry">
          Retry
        </button>
      )}
      <button className="status-item status-btn" onClick={props.onProblems} title="Show problems" data-testid="problem-counts">
        ⓧ {errors} ⚠ {warnings}
      </button>
      <span className="spacer" />
      <span className="status-item">
        Ln {props.cursor.line}, Col {props.cursor.column}
      </span>
      <span className="status-item" title="IF-P6-WS-01 shared workspace: session and revision published to P6B" data-testid="ws-revision">
        {snapshot.sessionId} · rev {snapshot.revision}
      </span>
      <span className="status-item">VHDL</span>
    </footer>
  );
}
