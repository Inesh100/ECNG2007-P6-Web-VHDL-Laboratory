// SYS-TC: black-box system tests derived from the P6B SRS, run against the
// rendered app with the fixture workspace and the parent-project simulator.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import type { JobRequest } from '../../src/contracts/hdlService';
import type { LaunchContext } from '../../src/contracts/launchResult';
import { LAUNCH_EXAMPLES } from '../../src/launch/examples';
import { EmbeddedTransport, type Fault } from '../../src/service/embeddedTransport';
import { HdlServiceClient } from '../../src/service/hdlServiceClient';
import { HDL_CASES } from '../../src/simulator/fixtures';
import { JobStore } from '../../src/simulator/jobStore';
import { FixtureWorkspace } from '../../src/workspace/fixtureWorkspace';

function setup(opts: { fault?: Fault; launch?: { context?: LaunchContext; errors: string[] } } = {}) {
  const transport = new EmbeddedTransport(new JobStore(2));
  const submitted: JobRequest[] = [];
  const realFetch = transport.fetch;
  transport.fetch = async (url, init) => {
    if (init?.method === 'POST') submitted.push(JSON.parse(String(init.body)));
    return realFetch(url, init);
  };
  transport.fault = opts.fault ?? 'none';
  const workspace = new FixtureWorkspace();
  const user = userEvent.setup();
  render(
    <App
      workspace={workspace}
      initialService={{ mode: 'embedded', url: '', fault: opts.fault ?? 'none' }}
      clientFactory={() => new HdlServiceClient(transport, { pollIntervalMs: 5 })}
      launch={opts.launch}
    />,
  );
  return { workspace, user, submitted };
}

async function runCase(user: ReturnType<typeof userEvent.setup>, caseId: string) {
  await user.selectOptions(screen.getByTestId('case-select'), caseId);
  await user.click(screen.getByTestId('run-button'));
  await waitFor(() => expect(screen.getByTestId('run-button')).not.toBeDisabled(), { timeout: 4000 });
}

describe('SYS-TC-01..08 published HDL cases display correctly (P6-AC2.1)', () => {
  it.each(HDL_CASES.map((c) => [c.id, c.title, c] as const))('%s %s', async (_id, _t, c) => {
    const { user } = setup();
    await runCase(user, c.id);
    if (c.expected.status === 'succeeded') {
      expect(screen.getByTestId('result-status')).toHaveTextContent('Succeeded');
      expect(screen.queryByTestId('failure-category')).toBeNull();
    } else {
      const badge = screen.getByTestId('failure-category');
      expect(badge).toHaveAttribute('data-category', c.expected.category);
      const text = { analysis: 'Analysis failure', elaboration: 'Elaboration failure', simulation: 'Simulation failure', service: 'Service/runtime failure' }[c.expected.category!];
      expect(badge).toHaveTextContent(text);
    }
    // P6B-FR-14: waveform tab enabled only when a VCD came back.
    if (c.expected.waveform) expect(screen.getByTestId('tab-waveform')).toBeEnabled();
    else expect(screen.getByTestId('tab-waveform')).toBeDisabled();
  });
});

describe('SYS-TC-09 stage/status shown while running (P6B-FR-05)', () => {
  it('shows the running banner, then the completed pipeline', async () => {
    const { user } = setup();
    await user.click(screen.getByTestId('run-button'));
    expect(screen.getByTestId('status-banner')).toHaveTextContent('Running');
    await waitFor(() => expect(screen.getByTestId('step-completed')).toHaveAttribute('data-state', 'passed'), { timeout: 4000 });
    for (const s of ['analysis', 'elaboration', 'simulation']) expect(screen.getByTestId(`step-${s}`)).toHaveAttribute('data-state', 'passed');
  });
});

describe('SYS-TC-10 logs and problems are shown (P6B-FR-11, UR-02)', () => {
  it('lists GHDL log lines and the source location of an analysis error', async () => {
    const { user } = setup();
    await runCase(user, 'HDL-02');
    const problems = screen.getByTestId('problems');
    expect(problems).toHaveTextContent("';' is expected here");
    expect(problems).toHaveTextContent('src/counter.vhd:27');
    await user.click(screen.getByTestId('tab-console'));
    expect(screen.getByTestId('logs')).toHaveTextContent('ghdl -a --std=08 src/counter.vhd');
  });
});

describe('SYS-TC-11 results for a successful run (P6B-FR-10)', () => {
  it('shows summary, simulated time and testbench reports', async () => {
    const { user } = setup();
    await runCase(user, 'HDL-01');
    await user.click(screen.getByTestId('tab-results'));
    const results = screen.getByTestId('results');
    expect(results).toHaveTextContent('250 ns');
    expect(results).toHaveTextContent('tb_counter finished');
    expect(screen.getByTestId('waveform-availability')).toHaveTextContent('tb_counter.vcd');
  });
});

describe('SYS-TC-12 service unavailable (P6B-FR-09, transport level)', () => {
  it('shows a service/runtime failure without blaming the VHDL', async () => {
    const { user } = setup({ fault: 'unavailable' });
    await user.click(screen.getByTestId('run-button'));
    await waitFor(() => expect(screen.getByTestId('failure-category')).toHaveTextContent('Service/runtime failure'), { timeout: 4000 });
    expect(screen.getByTestId('status-banner')).toHaveTextContent('Your VHDL may be fine');
  });
});

describe('SYS-TC-13 the edited revision is what gets submitted (P6B-FR-04/18 with test double)', () => {
  it('submits the latest workspace content and revision', async () => {
    const { user, workspace, submitted } = setup();
    workspace.updateFile('tb/tb_counter.vhd', workspace.getSnapshot().files[1].content.replace('10 ns', '20 ns'));
    await user.click(screen.getByTestId('run-button'));
    await waitFor(() => expect(screen.getByTestId('result-status')).toBeInTheDocument(), { timeout: 4000 });
    expect(submitted[0].revision).toBe(workspace.getSnapshot().revision);
    expect(submitted[0].files[1].content).toContain('CLK_PERIOD : time := 20 ns');
    expect(screen.getByTestId('ws-revision')).toHaveTextContent(String(submitted[0].revision));
  });
  it('flags results as stale after a later edit', async () => {
    const { user, workspace } = setup();
    await runCase(user, 'HDL-01');
    workspace.updateFile('src/counter.vhd', '-- changed');
    await waitFor(() => expect(screen.getByTestId('status-banner')).toHaveTextContent('Files changed since this run'));
  });
});

describe('SYS-TC-14 learning-tool result is produced after a launched run (P6B-FR-15/16)', () => {
  it('posts a completed result for a successful run to the host window', async () => {
    const posted = vi.fn();
    const parentSpy = vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage: posted } as unknown as Window);
    const ctx = LAUNCH_EXAMPLES[0].context as LaunchContext;
    const { user } = setup({ launch: { context: ctx, errors: [] } });
    expect(screen.getByTestId('launch-pill')).toHaveTextContent(ctx.activityId);
    await runCase(user, 'HDL-01');
    await waitFor(() => expect(posted).toHaveBeenCalled());
    const [msg] = posted.mock.calls[0];
    expect(msg).toMatchObject({ type: 'p6b.result', result: { launchId: ctx.launchId, status: 'completed', scoreGiven: 1 } });
    expect(within(screen.getByTestId('launch-pill')).getByTestId('launch-result')).toHaveTextContent('completed');
    parentSpy.mockRestore();
  });
  it('shows a rejected launch and sends nothing', () => {
    setup({ launch: { errors: ['targetType must be "web-vhdl-lab"'] } });
    expect(screen.getByRole('alert')).toHaveTextContent('could not be accepted');
  });
});
