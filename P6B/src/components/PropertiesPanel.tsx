/**
 * Right-hand PROPERTIES panel, like VHDLive: project, top entity, entities,
 * standard and the ports of the design. Read from the current workspace snapshot.
 */
import { findEntities, findPorts } from '../lib/vhdl';
import type { WorkspaceSnapshot } from '../workspace/types';

interface Props {
  snapshot: WorkspaceSnapshot;
  standard: string;
  workspaceLabel: string;
  isTestDouble: boolean;
}

export function PropertiesPanel({ snapshot, standard, workspaceLabel, isTestDouble }: Props) {
  const allText = snapshot.files.map((f) => f.content).join('\n');
  const entities = findEntities(allText);
  const design = snapshot.files.find((f) => f.role === 'design');
  const ports = design ? findPorts(design.content) : [];
  const designName = design ? findEntities(design.content)[0] : undefined;

  return (
    <aside className="props" aria-label="Properties">
      <div className="props-title">PROPERTIES</div>

      <div className="prop">
        <div className="prop-label">PROJECT</div>
        <div className="prop-value">counter (P6 reference)</div>
      </div>
      <div className="prop">
        <div className="prop-label">TOP ENTITY</div>
        <div className="prop-value mono" data-testid="ws-top">{snapshot.top}</div>
      </div>
      <div className="prop">
        <div className="prop-label">ENTITIES</div>
        <div className="prop-value">{entities.length} <span className="muted mono">{entities.join(', ')}</span></div>
      </div>
      <div className="prop">
        <div className="prop-label">STANDARD</div>
        <div className="prop-value mono">VHDL-{standard === '08' ? '2008' : '93'}</div>
      </div>
      <div className="prop">
        <div className="prop-label">WORKSPACE</div>
        <div className="prop-value">
          {workspaceLabel} {isTestDouble && <span className="vchip warn" title="Stands in for P6A until integration">test double</span>}
        </div>
        <div className="prop-value muted">revision <b data-testid="ws-revision">{snapshot.revision}</b></div>
      </div>

      {ports.length > 0 && (
        <>
          <div className="props-section">PORTS {designName && <span className="muted">· {designName}</span>}</div>
          {ports.map((p) => (
            <div className="port" key={p.name}>
              <div className="prop-label">{p.direction.toUpperCase()}</div>
              <div className="prop-value mono">{p.name} : {p.type}</div>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}
