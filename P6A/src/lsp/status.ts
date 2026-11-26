/**
 * Language-service status shown by the status indicator, DE-A-05 (P6A-FR-7).
 *
 * The editor never depends on this state: whatever it says, the Monaco editor
 * stays editable and keeps publishing the workspace. Only diagnostics,
 * completion and hover depend on the language service.
 */

export type LsState = 'off' | 'connecting' | 'ready' | 'unavailable';

export interface LsStatus {
  state: LsState;
  /** Short text for the status bar. */
  text: string;
  /** Longer explanation for the tooltip / banner. */
  detail?: string;
  /** Can the user press Retry? */
  canRetry: boolean;
}

export const STATUS_OFF: LsStatus = { state: 'off', text: 'VHDL language service: off', canRetry: false };

export function connecting(where: string): LsStatus {
  return { state: 'connecting', text: 'VHDL language service: connecting…', detail: where, canRetry: false };
}

export function ready(where: string): LsStatus {
  return { state: 'ready', text: 'VHDL language service: ready', detail: where, canRetry: false };
}

export function unavailable(reason: string): LsStatus {
  return {
    state: 'unavailable',
    text: 'VHDL language service unavailable',
    detail: `${reason}. Editing still works; diagnostics and completion are paused until the service is back.`,
    canRetry: true,
  };
}

/** Turns any thrown value into a short reason sentence. */
export function reasonOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Unknown language-service error';
}

/** Rejects after `ms` with `message` unless `p` settles first. */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
