/**
 * Browser-based Surfer (P6B-FR-12/13, P6B-IR-04, P6B-DC-03).
 *
 * Surfer's WASM build is hosted with the site under /surfer/. We give it the
 * job's VCD as a blob: URL using Surfer's own start-up URL parameters:
 *     surfer/index.html?load_url=<blob>&startup_commands=<commands>
 * Our small wrapper page (public/surfer/index.html) tells us when it is ready
 * and when the waveform has loaded.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

export const SURFER_PATH = `${import.meta.env.BASE_URL}surfer/index.html`;

/** Builds the Surfer address that loads a VCD and adds all testbench signals. */
export function surferSrc(vcdUrl: string, topScope: string): string {
  const commands = `scope_add_recursive ${topScope};zoom_fit`;
  return `${SURFER_PATH}?load_url=${encodeURIComponent(vcdUrl)}&startup_commands=${encodeURIComponent(commands)}`;
}

/** Opens Surfer in its own browser window with this VCD (the "Surfer ↗" button). */
export function openSurferWindow(vcd: string, topScope: string) {
  const blobUrl = URL.createObjectURL(new Blob([vcd], { type: 'text/plain' }));
  window.open(surferSrc(blobUrl, topScope), '_blank', 'width=1200,height=720');
}

type SurferState = 'loading' | 'ready' | 'loaded' | 'error';

interface Props {
  vcd: string;
  name: string;
  topScope: string;
  onLoaded?: () => void;
}

export function SurferViewer({ vcd, name, topScope, onLoaded }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<SurferState>('loading');
  const [error, setError] = useState('');

  // Keep the latest onLoaded in a ref so the message listener never goes stale.
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  // One blob URL per waveform. It is released when the waveform changes.
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([vcd], { type: 'text/plain' })), [vcd]);
  useEffect(() => {
    setState('loading');
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  // Listen for "ready" / "loaded" / "error" from the Surfer wrapper page.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string; message?: string };
      if (data?.source !== 'surfer') return;
      if (data.type === 'ready') setState((s) => (s === 'loaded' ? s : 'ready'));
      if (data.type === 'loaded') {
        setState('loaded');
        onLoadedRef.current?.();
      }
      if (data.type === 'error') {
        setError(data.message ?? 'unknown error');
        setState('error');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const stateText = {
    loading: 'Starting Surfer…',
    ready: 'Loading waveform…',
    loaded: 'Waveform open in Surfer',
    error: 'Surfer error',
  }[state];

  return (
    <div className="surfer">
      <div className="surfer-bar">
        <span className="mono">{name}</span>
        <span className={`vchip ${state === 'loaded' ? 'ok' : state === 'error' ? 'bad' : ''}`} data-testid="surfer-state">{stateText}</span>
        <span className="spacer" />
        <button className="vbtn sm" onClick={() => openSurferWindow(vcd, topScope)} data-testid="surfer-window">Surfer ↗ new window</button>
      </div>
      {error && <div className="vnote bad">Surfer could not start: {error}</div>}
      <iframe key={blobUrl} ref={frame} className="surfer-frame" title="Surfer waveform viewer" src={surferSrc(blobUrl, topScope)} data-testid="surfer-frame" />
    </div>
  );
}
