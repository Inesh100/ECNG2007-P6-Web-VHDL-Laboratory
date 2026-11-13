/**
 * Chooses which implementation of HDL Service Contract v1 P6B talks to:
 * the in-browser parent-project simulator, or an HTTP endpoint (the Node
 * simulator in /simulator, or a compatible Project 5 backend at integration).
 */
import { useState } from 'react';
import type { Fault } from '../service/embeddedTransport';

export interface ServiceConfig {
  mode: 'embedded' | 'http';
  url: string;
  fault: Fault;
}

interface Props {
  config: ServiceConfig;
  onChange: (c: ServiceConfig) => void;
  onClose: () => void;
  health?: string;
  onCheck: () => void;
}

export function ServiceSettings({ config, onChange, onClose, health, onCheck }: Props) {
  const [draft, setDraft] = useState(config);
  return (
    <div className="drawer" role="dialog" aria-label="Service settings">
      <div className="drawer-head">
        <h2>HDL service</h2>
        <button className="vbtn sm" onClick={onClose} aria-label="Close settings">Close</button>
      </div>
      <fieldset>
        <legend>Implementation</legend>
        <label className="radio">
          <input type="radio" name="mode" checked={draft.mode === 'embedded'} onChange={() => setDraft({ ...draft, mode: 'embedded' })} />
          <span>
            <b>Parent-project service simulator (in browser)</b>
            <small>Deterministic test double of the GHDL execution service. No network needed.</small>
          </span>
        </label>
        <label className="radio">
          <input type="radio" name="mode" checked={draft.mode === 'http'} onChange={() => setDraft({ ...draft, mode: 'http' })} data-testid="mode-http" />
          <span>
            <b>HTTP endpoint (REST + WebSocket)</b>
            <small>The Node simulator (<code>npm run simulator</code>) or any HDL Service Contract v1 backend.</small>
          </span>
        </label>
        {draft.mode === 'http' && (
          <input className="mono url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="http://localhost:8787" data-testid="service-url" />
        )}
      </fieldset>
      {draft.mode === 'embedded' && (
        <fieldset>
          <legend>Fault injection (testing service/runtime handling)</legend>
          <select value={draft.fault} onChange={(e) => setDraft({ ...draft, fault: e.target.value as Fault })} data-testid="fault-select">
            <option value="none">None</option>
            <option value="unavailable">Service unavailable (HTTP 503)</option>
            <option value="malformed">Malformed contract response</option>
          </select>
        </fieldset>
      )}
      <div className="drawer-actions">
        <button className="vbtn" onClick={onCheck}>Check connection</button>
        <button className="vbtn primary" onClick={() => onChange(draft)} data-testid="apply-settings">Apply</button>
      </div>
      {health && <p className="health mono" data-testid="health">{health}</p>}
    </div>
  );
}
