/**
 * P6A entry point.
 *
 * The workspace store is created and PUBLISHED before anything renders, so P6B
 * (same page, other frame or other tab of this origin) can read it as soon as
 * it starts (IF-P6-WS-01).
 */
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { REFERENCE_TOP, referenceFiles } from './files/referenceFiles';
import { parseLsConfig } from './lsp/config';
import { WorkspaceStore } from './workspace/workspaceStore';
import './styles.css';

const params = new URLSearchParams(window.location.search);

const store = new WorkspaceStore({ files: referenceFiles(), top: REFERENCE_TOP });
store.expose(window);

// StrictMode is not used: it would mount the Monaco editor and language client twice.
createRoot(document.getElementById('root')!).render(
  <App
    store={store}
    lsConfig={parseLsConfig(window.location.search)}
    showRunPanel={params.get('run') !== '0'}
    initialScenarioId={params.get('scenario') ?? undefined}
  />,
);
