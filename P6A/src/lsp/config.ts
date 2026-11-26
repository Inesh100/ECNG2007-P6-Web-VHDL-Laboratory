/**
 * Language-service connection settings, read from the page URL.
 *
 *   (default)                 in-browser simulator in a Web Worker
 *   ?lsp=ws://host:port/path  any LSP-over-WebSocket server: the Node simulator
 *                             (npm run lsp-server) or a Project 5 VHDL-LS gateway
 *   ?lsp=off                  no language service (editor only)
 *   ?lspFault=refuse|timeout|error|crash   fault injection for IT-LSP-02
 *   ?lspTimeout=<ms>          start-up timeout (default 5000)
 *
 * Kept free of browser and Monaco imports so it can be unit-tested.
 */

export type LsTransport = 'worker' | 'websocket' | 'off';
export type LsFault = 'none' | 'refuse' | 'timeout' | 'error' | 'crash';

export interface LsConfig {
  transport: LsTransport;
  /** WebSocket URL when transport is 'websocket'. */
  url?: string;
  fault: LsFault;
  timeoutMs: number;
}

const FAULTS: readonly LsFault[] = ['none', 'refuse', 'timeout', 'error', 'crash'];
export const DEFAULT_TIMEOUT_MS = 5000;

export function parseLsConfig(search: string): LsConfig {
  const p = new URLSearchParams(search);
  const lsp = (p.get('lsp') ?? '').trim();
  const faultParam = (p.get('lspFault') ?? 'none').trim().toLowerCase() as LsFault;
  const fault = FAULTS.includes(faultParam) ? faultParam : 'none';
  const t = Number(p.get('lspTimeout'));
  const timeoutMs = Number.isFinite(t) && t > 0 ? t : DEFAULT_TIMEOUT_MS;

  if (lsp === 'off') return { transport: 'off', fault: 'none', timeoutMs };
  if (/^wss?:\/\//i.test(lsp)) return { transport: 'websocket', url: lsp, fault, timeoutMs };
  return { transport: 'worker', fault, timeoutMs };
}

/** Human description shown in the status bar tooltip. */
export function describeLsConfig(c: LsConfig): string {
  const where =
    c.transport === 'worker'
      ? 'in-browser language-service simulator (Web Worker)'
      : c.transport === 'websocket'
        ? `language server at ${c.url}`
        : 'language service turned off';
  return c.fault === 'none' ? where : `${where}, injected fault: ${c.fault}`;
}
