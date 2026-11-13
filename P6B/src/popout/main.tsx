/**
 * The pop-out output window. It shows the same OutputPanel as the main page,
 * fed by messages from the main page over a BroadcastChannel (see channel.ts).
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OutputPanel } from '../components/OutputPanel';
import '../styles.css';
import { openChannel, type OutputMessage, type OutputState } from './channel';

function Popout() {
  const [state, setState] = useState<OutputState>();
  const channel = useRef<BroadcastChannel>();

  useEffect(() => {
    const ch = openChannel();
    channel.current = ch;
    if (!ch) return;
    ch.onmessage = (event: MessageEvent<OutputMessage>) => {
      if (event.data.type === 'state') setState(event.data.state);
    };
    // Ask the main page for the current output.
    ch.postMessage({ type: 'hello' } satisfies OutputMessage);
    // Tell the main page when this window closes, so it shows the output again.
    const onClose = () => ch.postMessage({ type: 'bye' } satisfies OutputMessage);
    window.addEventListener('beforeunload', onClose);
    return () => {
      window.removeEventListener('beforeunload', onClose);
      ch.close();
    };
  }, []);

  const send = (msg: OutputMessage) => channel.current?.postMessage(msg);

  if (!state) {
    return (
      <div className="popout-wait">
        <p>Waiting for the lab window…</p>
        <p className="muted">Open this from the lab with <b>⧉ Pop out</b>. If the lab tab was closed, open it again.</p>
      </div>
    );
  }

  return (
    <div className="popout-page">
      <header className="topbar">
        <span className="brand">VHDL Lab <b>P6B</b> · Output</span>
        <span className="spacer" />
        <span className="muted small">Linked to the lab window · revision {state.currentRevision}</span>
      </header>
      <OutputPanel
        run={state.run}
        history={state.history}
        currentRevision={state.currentRevision}
        isPopout
        onRerun={() => send({ type: 'run' })}
        onGoto={(file, line) => send({ type: 'goto', file, line })}
        onWaveformViewed={() => send({ type: 'waveformViewed' })}
        onDock={() => {
          send({ type: 'bye' });
          window.close();
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popout />
  </StrictMode>,
);
