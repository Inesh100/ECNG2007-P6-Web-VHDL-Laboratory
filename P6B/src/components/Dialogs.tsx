/**
 * Small pop-up dialogs: welcome tour, keyboard shortcuts and about.
 */

interface DialogProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  buttons?: React.ReactNode;
}

export function Dialog({ title, children, onClose, buttons }: DialogProps) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="dialog-buttons">{buttons ?? <button className="vbtn primary" onClick={onClose}>Close</button>}</div>
      </div>
    </div>
  );
}

export function WelcomeDialog({ onClose, onNever }: { onClose: () => void; onNever: () => void }) {
  const steps: [string, string][] = [
    ['Files', 'the reference counter design and testbench. Use File → Examples to load a published test case.'],
    ['Simulate ▶', 'top-right button (or Ctrl+Enter). Each GHDL stage is shown: Analysis › Elaboration › Simulation.'],
    ['Failures', 'are named clearly: analysis, elaboration, simulation or service/runtime. Click a problem to see the line.'],
    ['Waveform / Surfer', 'bottom tabs. Surfer ↗ opens the waveform in its own window.'],
    ['⧉ Pop out', 'moves the whole output panel into a separate window, handy on a second screen.'],
  ];
  return (
    <Dialog
      title="👋 Welcome to the Web VHDL Lab"
      onClose={onClose}
      buttons={
        <>
          <button className="vbtn" onClick={onClose}>Maybe later</button>
          <button className="vbtn primary" onClick={onNever} data-testid="welcome-ok">Got it — don’t show again</button>
        </>
      }
    >
      <p>Run, results and waveforms for VHDL in the browser, no install needed. The 30-second tour:</p>
      <ol className="tour">
        {steps.map(([head, text]) => (
          <li key={head}><b>{head}</b> — {text}</li>
        ))}
      </ol>
    </Dialog>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <table className="kv">
        <tbody>
          <tr><th><kbd>Ctrl</kbd> + <kbd>Enter</kbd></th><td>Simulate</td></tr>
          <tr><th><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd></th><td>Pop out / dock the output</td></tr>
          <tr><th><kbd>Esc</kbd></th><td>Close menus and dialogs</td></tr>
        </tbody>
      </table>
    </Dialog>
  );
}

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="About" onClose={onClose}>
      <p><b>Web VHDL Laboratory · P6B Run, Results &amp; Waveforms</b></p>
      <p>ECNG 2007 Group 6, Subproject P6B. Submits VHDL jobs using HDL Service Contract v1, shows stage-specific results and logs, and displays VCD waveforms in <a href="https://surfer-project.org" target="_blank" rel="noreferrer">Surfer</a> (EUPL-1.2).</p>
      <p className="muted">The code view here is a stand-in for P6A's editor. Layout inspired by VHDLive.</p>
    </Dialog>
  );
}
