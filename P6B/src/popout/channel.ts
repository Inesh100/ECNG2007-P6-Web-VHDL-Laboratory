/**
 * Messages between the main lab page and the pop-out output window.
 *
 * Both pages are on the same site, so they talk over a BroadcastChannel.
 * The main page owns the run; the pop-out only shows it and can ask for a re-run.
 */
import type { HistoryItem, RunState } from '../run/useRunController';

export const OUTPUT_CHANNEL = 'p6b-output-v1';

/** Everything the pop-out needs to draw the output panel. */
export interface OutputState {
  run: RunState;
  history: HistoryItem[];
  currentRevision: number;
}

export type OutputMessage =
  | { type: 'state'; state: OutputState } // main -> pop-out: here is the latest output
  | { type: 'hello' } // pop-out -> main: I have opened, send me the state
  | { type: 'bye' } // pop-out -> main: I am closing, show the output again
  | { type: 'run' } // pop-out -> main: please run again
  | { type: 'goto'; file: string; line: number } // pop-out -> main: show this line in the code
  | { type: 'waveformViewed' }; // pop-out -> main: Surfer finished loading

export function openChannel(): BroadcastChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined;
  return new BroadcastChannel(OUTPUT_CHANNEL);
}

/** Opens (or focuses) the pop-out window. */
export function openPopoutWindow(): Window | null {
  const url = `${import.meta.env.BASE_URL}popout.html`;
  const win = window.open(url, 'p6b-output', 'width=1200,height=720');
  win?.focus();
  return win;
}
