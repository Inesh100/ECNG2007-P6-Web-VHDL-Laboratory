/**
 * The "☰ File" drop-down menu, laid out like VHDLive's.
 */
import { useState } from 'react';
import { HDL_CASES, type HdlCase } from '../simulator/fixtures';

interface Props {
  canEdit: boolean;
  currentFile: string;
  hasVcd: boolean;
  onClose: () => void;
  onLoadCase: (c: HdlCase) => void;
  onReset: () => void;
  onDownloadFile: () => void;
  onDownloadVcd: () => void;
  onSettings: () => void;
  onShortcuts: () => void;
  onAbout: () => void;
  onWelcome: () => void;
}

export function FileMenu(props: Props) {
  const [showExamples, setShowExamples] = useState(false);
  const harnessUrl = `${import.meta.env.BASE_URL}harness.html`;

  // Runs a menu action and closes the menu.
  const pick = (action: () => void) => () => {
    action();
    props.onClose();
  };

  return (
    <>
      <div className="menu-backdrop" onClick={props.onClose} />
      <div className="menu" role="menu" data-testid="file-menu">
        {props.canEdit && (
          <button className="menu-item" onClick={() => setShowExamples(!showExamples)} data-testid="menu-examples">
            📂 Examples (published HDL cases) {showExamples ? '▾' : '▸'}
          </button>
        )}
        {showExamples &&
          HDL_CASES.map((c) => (
            <button key={c.id} className="menu-item sub" onClick={pick(() => props.onLoadCase(c))} data-testid={`menu-case-${c.id}`}>
              <span className="mono">{c.id}</span> {c.title}
            </button>
          ))}
        {props.canEdit && <button className="menu-item" onClick={pick(props.onReset)}>↺ Reset files to reference</button>}
        <div className="menu-sep" />
        <button className="menu-item" onClick={pick(props.onDownloadFile)}>⬇ Download {props.currentFile.split('/').pop()}</button>
        <button className="menu-item" onClick={pick(props.onDownloadVcd)} disabled={!props.hasVcd}>⬇ Download last VCD</button>
        <div className="menu-sep" />
        <button className="menu-item" onClick={pick(props.onSettings)} data-testid="menu-settings">⚙ Simulation service…</button>
        <a className="menu-item" href={harnessUrl} target="_blank" rel="noreferrer">🧪 Launch/result harness ↗</a>
        <div className="menu-sep" />
        <button className="menu-item" onClick={pick(props.onShortcuts)}>? Keyboard shortcuts…</button>
        <button className="menu-item" onClick={pick(props.onWelcome)}>👋 Show welcome tour</button>
        <button className="menu-item" onClick={pick(props.onAbout)}>ⓘ About this lab…</button>
      </div>
    </>
  );
}
