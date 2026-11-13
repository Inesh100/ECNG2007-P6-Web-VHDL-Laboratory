import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { loadServiceConfig, welcomeSeen } from './App';
import type { ServiceConfig } from './components/ServiceSettings';
import { parseLaunchParam } from './launch/launch';
import { FixtureWorkspace } from './workspace/fixtureWorkspace';
import { hasSharedWorkspace, SharedWorkspace } from './workspace/sharedWorkspace';
import './styles.css';

const params = new URLSearchParams(window.location.search);

// Workspace seam: the real P6A editor if present, otherwise the fixture test double.
const fixture = new FixtureWorkspace();
const workspace = hasSharedWorkspace() ? new SharedWorkspace(fixture.getSnapshot()) : fixture;

// Service: ?service=<url> forces an HTTP endpoint; otherwise remembered choice or the simulator.
const saved = loadServiceConfig();
const serviceUrl = params.get('service');
const initialService: ServiceConfig = {
  mode: serviceUrl ? 'http' : saved.mode ?? 'embedded',
  url: serviceUrl ?? saved.url ?? 'http://localhost:8787',
  fault: 'none',
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      workspace={workspace}
      initialService={initialService}
      launch={parseLaunchParam(window.location.search)}
      initialCaseId={params.get('case') ?? undefined}
      autorun={params.get('autorun') === '1'}
      openWaveform={params.get('openWaveform') === '1'}
      showWelcome={!welcomeSeen() && !params.has('launch') && params.get('autorun') !== '1'}
    />
  </StrictMode>,
);
