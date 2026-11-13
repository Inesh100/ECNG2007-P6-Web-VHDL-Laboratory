# Deployment and Configuration: P6B

## Static site

P6B builds to static files and has no server-side component.

```bash
npm ci
npm run build        # outputs dist/ (index.html, harness.html, assets/, surfer/)
npx vite preview     # local check at http://localhost:4173
```

`vite.config.ts` uses `base: './'`, so `dist/` works from any host or sub-path, including GitHub Pages project URLs.

### Firebase Hosting (configured at repo root)

From the repository root, `bash scripts/build-site.sh` builds the combined site into `site/` (P6B at `/P6B/`), then `npx firebase-tools deploy --only hosting --project <PROJECT_ID>` publishes it. Settings are in the root `firebase.json`.

### Any other static host

Upload the contents of `dist/`. Serve `.wasm` as `application/wasm`; most hosts do this already.

## HDL service endpoint

| Mode | How to select | Use |
|---|---|---|
| In-browser parent-project simulator (default) | Nothing to set | Demos, independent verification, deployed site |
| Node simulator (REST + WebSocket) | `npm run simulator` then `?service=http://localhost:8787`, or the service pill | Testing the real network path |
| Compatible Project 5 backend | `?service=https://<backend>` or the service pill | Portfolio integration |

The backend must allow CORS from the site's origin for `GET`/`POST` and accept WebSocket upgrades on `/api/v1/jobs/{id}/events`. If WebSocket is blocked, the client polls instead.

## Integrating with P6A

See `docs/interface-p6a-p6b.md` §5. In short, P6A exposes `window.__P6_WORKSPACE__` (or the `p6-workspace-v1` BroadcastChannel). P6B detects it at start-up and switches from the test double to the real editor state.

## Embedding as a learning-tool activity

The host opens `index.html?launch=<base64url(JSON LaunchContext)>` in an iframe or popup, with `returnOrigin` set to the host origin. It listens for `message` events of `{ type: 'p6b.result', result }`. `harness.html` is a working reference host.
