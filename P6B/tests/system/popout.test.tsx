// SYS-TC-15: pop-out output window. The main page and pop-out talk over a
// BroadcastChannel; here we play the pop-out side of the channel.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { OUTPUT_CHANNEL, type OutputMessage } from '../../src/popout/channel';
import { EmbeddedTransport } from '../../src/service/embeddedTransport';
import { HdlServiceClient } from '../../src/service/hdlServiceClient';
import { JobStore } from '../../src/simulator/jobStore';
import { FixtureWorkspace } from '../../src/workspace/fixtureWorkspace';

describe('SYS-TC-15 output can pop out into its own window and come back', () => {
  it('opens the pop-out, streams the result to it, accepts a re-run, and docks when it closes', async () => {
    const fakeWindow = { closed: false, close: vi.fn(), focus: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow as unknown as Window);
    const transport = new EmbeddedTransport(new JobStore(2));
    const user = userEvent.setup();
    render(<App workspace={new FixtureWorkspace()} initialService={{ mode: 'embedded', url: '', fault: 'none' }} clientFactory={() => new HdlServiceClient(transport)} />);

    // The pop-out side of the channel.
    const received: OutputMessage[] = [];
    const popout = new BroadcastChannel(OUTPUT_CHANNEL);
    popout.onmessage = (e: MessageEvent<OutputMessage>) => received.push(e.data);

    await user.click(screen.getByTestId('popout-button'));
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('popout.html'), 'p6b-output', expect.any(String));
    expect(screen.getByTestId('popped-note')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-console')).toBeNull(); // output left the main page

    // Pop-out says hello and gets the current state.
    popout.postMessage({ type: 'hello' } satisfies OutputMessage);
    await waitFor(() => expect(received.some((m) => m.type === 'state')).toBe(true));

    // Pop-out asks for a run; the final result is streamed to it.
    popout.postMessage({ type: 'run' } satisfies OutputMessage);
    await waitFor(
      () => {
        const last = [...received].reverse().find((m) => m.type === 'state');
        expect(last?.type === 'state' && last.state.run.job?.status).toBe('succeeded');
      },
      { timeout: 4000 },
    );

    // Pop-out closes: the output panel comes back.
    popout.postMessage({ type: 'bye' } satisfies OutputMessage);
    await waitFor(() => expect(screen.getByTestId('tab-console')).toBeInTheDocument());
    expect(screen.getByTestId('result-status')).toHaveTextContent('Succeeded');

    popout.close();
    openSpy.mockRestore();
  });
});
