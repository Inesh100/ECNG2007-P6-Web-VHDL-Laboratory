import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

/**
 * Serves the BUILT P6B app (../P6B/dist) at /P6B/ during `vite` and
 * `vite preview`, so the editor and P6B share one origin and the IF-P6-WS-01
 * BroadcastChannel connects them, exactly as on the combined site.
 * P6B itself is not changed: build it with `cd ../P6B && npm run build`.
 */
const P6B_DIST = resolve(import.meta.dirname, '../P6B/dist');
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.vcd': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveP6B(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? '';
    if (url !== '/P6B' && !url.startsWith('/P6B/')) return next();
    const rel = decodeURIComponent(url.split('?')[0].replace(/^\/P6B\/?/, '')) || 'index.html';
    const file = normalize(join(P6B_DIST, rel));
    if (file !== P6B_DIST && !file.startsWith(P6B_DIST + sep)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('P6B is not built yet. Run: cd P6B && npm install && npm run build');
      return;
    }
    res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  };
  return {
    name: 'p6a-serve-built-p6b',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// Relative base so the build works on any static host or sub-path.
export default defineConfig({
  base: './',
  plugins: [react(), serveP6B()],
  resolve: {
    // one copy of the VS Code API (monaco-languageclient recommendation)
    dedupe: ['vscode'],
  },
  worker: { format: 'es' },
  optimizeDeps: {
    include: ['vscode-languageserver/browser', 'vscode-languageserver-protocol/browser', 'vscode-ws-jsonrpc'],
  },
  server: { port: 5174 },
  preview: { port: 4174 },
  build: { target: 'es2022', chunkSizeWarningLimit: 8000 },
});
