/**
 * Transport abstraction for HDL Service Contract v1 (P6B-IR-03, P6B-DC-02).
 *
 * The client speaks plain REST (fetch) and WebSocket. A Transport supplies both,
 * so the same client code runs against:
 *   - a real HTTP endpoint (browser fetch + WebSocket)          -> HttpTransport
 *   - the in-browser parent-project simulator (no network)     -> EmbeddedTransport
 *   - test doubles in unit tests
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The subset of the browser WebSocket API the client uses. */
export interface SocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  close(): void;
}

export interface Transport {
  readonly kind: 'http' | 'embedded' | 'test';
  readonly baseUrl: string;
  fetch: FetchLike;
  /** Returns undefined when WebSocket is not available; the client then polls. */
  openSocket(url: string): SocketLike | undefined;
}

export class HttpTransport implements Transport {
  readonly kind = 'http' as const;
  constructor(readonly baseUrl: string) {}
  fetch: FetchLike = (input, init) => fetch(input, init);
  openSocket(url: string): SocketLike | undefined {
    if (typeof WebSocket === 'undefined') return undefined;
    const wsUrl = url.replace(/^http/, 'ws');
    try {
      return new WebSocket(wsUrl) as unknown as SocketLike;
    } catch {
      return undefined;
    }
  }
}
