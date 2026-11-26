/**
 * P6A language client, DE-A-04 (P6A-FR-4, P6A-FR-5, P6A-FR-7, P6A-DC-02).
 *
 * Connects Monaco to a VHDL language server through monaco-languageclient
 * (an existing LSP client library; P6A does not implement LSP by hand).
 * Two transports:
 *   - worker:    the P6A language-service simulator in a Web Worker (default)
 *   - websocket: any LSP-over-WebSocket server (Node simulator or a Project 5
 *                VHDL-LS gateway), via vscode-ws-jsonrpc
 *
 * Every failure (refused, timeout, error, connection lost) ends in the
 * 'unavailable' status with a reason. The editor itself is never blocked.
 */
import { MonacoLanguageClient } from 'monaco-languageclient';
import { CloseAction, ErrorAction, type MessageTransports } from 'vscode-languageclient/browser';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageserver-protocol/browser';
import { WebSocketMessageReader, WebSocketMessageWriter, toSocket } from 'vscode-ws-jsonrpc';
import LanguageServiceWorker from '../languageService/worker?worker';
import { VHDL_LANGUAGE_ID } from '../editor/vhdlLanguage';
import { describeLsConfig, type LsConfig } from './config';
import { STATUS_OFF, connecting, ready, reasonOf, unavailable, withTimeout, type LsStatus } from './status';

export class LanguageClientController {
  private client?: MonacoLanguageClient;
  private worker?: Worker;
  private socket?: WebSocket;
  /** Bumped on every start/stop so late callbacks from an old attempt are ignored. */
  private generation = 0;

  constructor(
    private readonly config: LsConfig,
    private readonly onStatus: (status: LsStatus) => void,
  ) {}

  async start(): Promise<void> {
    if (this.config.transport === 'off') {
      this.onStatus(STATUS_OFF);
      return;
    }
    const gen = ++this.generation;
    const where = describeLsConfig(this.config);
    this.onStatus(connecting(where));

    try {
      const transports = await withTimeout(
        this.openTransports(gen),
        this.config.timeoutMs,
        'Could not connect to the language service (timeout)',
      );
      if (gen !== this.generation) return;

      transports.reader.onClose(() => this.lost(gen, 'The language-service connection was closed'));
      transports.reader.onError(() => this.lost(gen, 'The language-service connection reported an error'));

      const client = new MonacoLanguageClient({
        id: `p6a-vhdl-${gen}`,
        name: 'P6A VHDL language client',
        messageTransports: transports,
        clientOptions: {
          documentSelector: [{ language: VHDL_LANGUAGE_ID }],
          initializationFailedHandler: () => false,
          errorHandler: {
            error: () => ({ action: ErrorAction.Continue, handled: true }),
            closed: () => {
              this.lost(gen, 'The language-service connection was closed');
              return { action: CloseAction.DoNotRestart, handled: true };
            },
          },
        },
      });
      this.client = client;

      await withTimeout(client.start(), this.config.timeoutMs, 'The language service did not answer in time (timeout)');
      if (gen !== this.generation) return;
      this.onStatus(ready(where));
    } catch (err) {
      if (gen !== this.generation) return;
      await this.teardown();
      this.onStatus(unavailable(reasonOf(err)));
    }
  }

  /** Stop and start again (the Retry button). */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async stop(): Promise<void> {
    this.generation++;
    await this.teardown();
  }

  private lost(gen: number, reason: string): void {
    if (gen !== this.generation) return;
    this.generation++; // only report the first loss
    void this.teardown().then(() => this.onStatus(unavailable(reason)));
  }

  private async openTransports(gen: number): Promise<MessageTransports> {
    return this.config.transport === 'websocket' ? this.openWebSocket() : this.openWorker(gen);
  }

  private openWorker(gen: number): MessageTransports {
    if (this.config.fault === 'refuse') throw new Error('The connection to the language service was refused (simulated fault)');
    const worker = new LanguageServiceWorker({ name: 'P6A VHDL language service' });
    this.worker = worker;
    worker.addEventListener('message', (ev: MessageEvent) => {
      if ((ev.data as { type?: string } | undefined)?.type === 'p6a-ls-crashed') {
        this.lost(gen, 'The language service stopped unexpectedly (simulated crash)');
      }
    });
    worker.addEventListener('error', () => this.lost(gen, 'The language-service worker failed'));
    // Must be the first message: tells the worker which fault (if any) to simulate.
    worker.postMessage({ type: 'p6a-ls-init', fault: this.config.fault });
    return { reader: new BrowserMessageReader(worker), writer: new BrowserMessageWriter(worker) };
  }

  private openWebSocket(): Promise<MessageTransports> {
    const url = this.config.fault === 'refuse' ? 'ws://127.0.0.1:1/refused' : (this.config.url ?? '');
    return new Promise<MessageTransports>((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }
      this.socket = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        const socket = toSocket(ws);
        resolve({ reader: new WebSocketMessageReader(socket), writer: new WebSocketMessageWriter(socket) });
      };
      ws.onerror = () => {
        if (!opened) reject(new Error(`The connection to ${url} was refused`));
      };
      ws.onclose = () => {
        if (!opened) reject(new Error(`The connection to ${url} was closed before it opened`));
      };
    });
  }

  private async teardown(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (client) {
      try {
        await withTimeout(
          Promise.resolve().then(() => (client.isRunning() ? client.stop(1000) : client.dispose(1000))),
          1500,
          'stop timeout',
        );
      } catch {
        // the server is gone or never started: nothing more to do
      }
    }
    this.worker?.terminate();
    this.worker = undefined;
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.socket = undefined;
  }
}
