// IT-SEAM: the P6A -> P6B shared workspace/session seam (P6-StR4.1, P6B-FR-03/18).
// A minimal stand-in plays the P6A *writer* role through the agreed interface
// (window.__P6_WORKSPACE__); P6B must submit exactly what the owner published.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../../src/App';
import type { JobRequest } from '../../src/contracts/hdlService';
import { EmbeddedTransport } from '../../src/service/embeddedTransport';
import { HdlServiceClient } from '../../src/service/hdlServiceClient';
import { JobStore } from '../../src/simulator/jobStore';
import { referenceFiles } from '../../src/simulator/referenceFiles';
import { FixtureWorkspace } from '../../src/workspace/fixtureWorkspace';
import { SharedWorkspace } from '../../src/workspace/sharedWorkspace';
import { WORKSPACE_GLOBAL, type WorkspaceSnapshot } from '../../src/workspace/types';

/** Writer-side stand-in for P6A: owns the snapshot and publishes on every edit. */
class OwnerStandIn {
  private snap: WorkspaceSnapshot = { sessionId: 'p6a-session', revision: 1, top: 'tb_counter', files: referenceFiles(), diagnostics: { errors: 0, warnings: 0 }, updatedAt: '' };
  private ls = new Set<(s: WorkspaceSnapshot) => void>();
  getSnapshot = () => this.snap;
  subscribe = (fn: (s: WorkspaceSnapshot) => void) => (this.ls.add(fn), () => this.ls.delete(fn));
  edit(path: string, content: string) {
    this.snap = { ...this.snap, revision: this.snap.revision + 1, files: this.snap.files.map((f) => (f.path === path ? { ...f, content } : f)) };
    this.ls.forEach((l) => l(this.snap));
  }
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[WORKSPACE_GLOBAL];
});

describe('IT-SEAM-01 edit in owner, run in P6B, same state submitted', () => {
  it('submits the owner revision and content without restructuring and shows its result', async () => {
    const owner = new OwnerStandIn();
    (window as unknown as Record<string, unknown>)[WORKSPACE_GLOBAL] = owner;
    const workspace = new SharedWorkspace(new FixtureWorkspace().getSnapshot());
    const transport = new EmbeddedTransport(new JobStore(2));
    const sent: JobRequest[] = [];
    const f = transport.fetch;
    transport.fetch = async (u, i) => {
      if (i?.method === 'POST') sent.push(JSON.parse(String(i.body)));
      return f(u, i);
    };
    const user = userEvent.setup();
    render(<App workspace={workspace} initialService={{ mode: 'embedded', url: '', fault: 'none' }} clientFactory={() => new HdlServiceClient(transport)} />);

    expect(screen.getByText('P6A editor (shared workspace)')).toBeInTheDocument();
    expect(screen.queryByTestId('case-select')).toBeNull(); // no test-double controls with the real seam

    // Owner introduces an analysis error, P6B runs it.
    const broken = owner.getSnapshot().files[0].content.replace('count_r <= count_r + 1;', 'count_r <= count_r + 1');
    act(() => owner.edit('src/counter.vhd', broken));
    await waitFor(() => expect(screen.getByTestId('ws-revision')).toHaveTextContent('2'));
    await user.click(screen.getByTestId('run-button'));
    await waitFor(() => expect(screen.getByTestId('failure-category')).toHaveTextContent('Analysis failure'), { timeout: 4000 });
    expect(sent[0]).toMatchObject({ sessionId: 'p6a-session', revision: 2, top: 'tb_counter' });
    expect(sent[0].files).toEqual(owner.getSnapshot().files);

    // Owner fixes it; P6B runs the fixed state and the waveform becomes available.
    act(() => owner.edit('src/counter.vhd', referenceFiles()[0].content));
    await user.click(screen.getByTestId('run-button'));
    await waitFor(() => expect(screen.getByTestId('result-status')).toBeInTheDocument(), { timeout: 4000 });
    expect(sent[1].revision).toBe(3);
    expect(screen.getByTestId('tab-waveform')).toBeEnabled();
    workspace.dispose();
  });
});
