/**
 * Node WebSocket host for the P6A language-service simulator.
 *
 * Runs the same LSP server as the in-browser worker, but over WebSocket +
 * JSON-RPC (vscode-ws-jsonrpc): the transport a Project 5 VHDL-LS gateway uses.
 * Use it to exercise P6A's WebSocket path without Project 5:
 *
 *   npm run lsp-server                    # ws://localhost:8790/vhdl
 *   npm run lsp-server -- --port 9000 --fault error
 *   then open the editor with ?lsp=ws://localhost:8790/vhdl
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { WebSocketMessageReader, WebSocketMessageWriter, type IWebSocket } from 'vscode-ws-jsonrpc';
import { createConnection } from 'vscode-languageserver/node';
import { startVhdlLanguageServer, type LspConnection, type ServerFault } from '../src/languageService/server';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg('port', process.env.P6A_LSP_PORT ?? '8790'));
const fault = arg('fault', 'none') as ServerFault;
const path = arg('path', '/vhdl');

function toSocket(ws: WebSocket): IWebSocket {
  return {
    $type: 'IWebSocket',
    send: (content) => ws.send(content),
    onMessage: (cb) =>
      ws.on('message', (data) => {
        const text = data.toString();
        // A client 'exit' notification would make vscode-languageserver/node end
        // this whole process. Close only this client's socket instead.
        try {
          if ((JSON.parse(text) as { method?: string }).method === 'exit') {
            ws.close();
            return;
          }
        } catch {
          // not JSON: let the reader report it
        }
        cb(text);
      }),
    onError: (cb) => ws.on('error', cb),
    onClose: (cb) => ws.on('close', (code, reason) => cb(code, reason.toString())),
    dispose: () => ws.close(),
  };
}

const wss = new WebSocketServer({ port, path });

wss.on('connection', (ws) => {
  const socket = toSocket(ws);
  const reader = new WebSocketMessageReader(socket);
  const writer = new WebSocketMessageWriter(socket);
  const connection = createConnection(reader, writer);
  startVhdlLanguageServer(connection as unknown as LspConnection, { fault, onCrash: () => ws.close() });
  connection.listen();
  console.log(`[p6a-lsp] client connected (fault=${fault})`);
  ws.on('close', () => console.log('[p6a-lsp] client disconnected'));
});

wss.on('listening', () => {
  console.log(`P6A VHDL language-service simulator listening on ws://localhost:${port}${path} (fault=${fault})`);
});
