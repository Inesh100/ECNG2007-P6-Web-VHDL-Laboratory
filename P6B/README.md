# Web VHDL Laboratory: P6B Run, Results & Waveforms

ECNG 2007 Software Development Lifecycle Project 2026/27 · Group 6 · **Subproject P6B**

P6B is the run and results side of the P6 Web VHDL Laboratory. It takes the VHDL workspace published by P6A, submits it as a simulation job using **HDL Service Contract v1**, shows each GHDL stage with its logs, names any failure as **analysis**, **elaboration**, **simulation** or **service/runtime**, and opens the returned **VCD waveform in browser-based [Surfer](https://surfer-project.org)**. It also supports the simple **learning-tool launch/result** exchange.

P6B works and is tested on its own. It needs no P6A, Project 5 or Project 7 implementation (ECO-StR6.1).

| | |
|---|---|
| Stack | React 18 · TypeScript 5 · Vite 5 · fetch + WebSocket client · Surfer (WASM, self-hosted) |
| Pairs with | P6A Editor & Language Features, through the shared workspace seam [IF-P6-WS-01](docs/interface-p6a-p6b.md) |
| Docs | [SDD](docs/SDD-P6B.md) · [Test documentation](docs/test-documentation-P6B.md) · [RTM](docs/RTM-P6B.csv) · [Change log / CRs](docs/change-log.md) · [Deployment](docs/deployment.md) |

## What it does

The layout follows [VHDLive](https://vhdl.ai/vhdlive), so it feels like a familiar browser VHDL lab:

- **☰ File menu:** Examples (the published HDL cases), reset files, download a file or the last VCD, choose the simulation service, open the launch/result harness, shortcuts, and the welcome tour.
- **File tabs and code view:** the workspace files with line numbers and colours. When a problem is clicked, its line is highlighted.
- **Simulate ▶** (or Ctrl+Enter) submits the current revision unchanged. A stage strip shows Analysis › Elaboration › Simulation › Done.
- **PROPERTIES:** project, top entity, entities, VHDL standard, workspace revision and the design's ports.
- **Output tabs:**
  - **Waveform:** a quick built-in viewer with cursor values.
  - **Console:** logs; lines with a file:line can be clicked.
  - **Problems** and **Results**.
  - **Surfer:** embedded viewer, plus **Surfer ↗** to open it in its own window.
- **⧉ Pop out:** moves the whole output panel into a separate window that stays in sync. Re-run and problem clicks work from there too. **⇲ Dock** brings it back.
- **Failures:** an explicit badge for analysis, elaboration, simulation or service/runtime, plus a plain explanation.
- **Launch/result:** accepts `?launch=<base64url JSON>` and posts a `p6b.result` to the host. `harness.html` runs the published examples.
- **Service simulator:** a deterministic stand-in for the GHDL service, used in the browser (default) or as a Node REST/WebSocket server.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173  (uses the in-browser service simulator)
```

Pick an **Example** in the bottom bar (or File → Examples, HDL-01..08) and press **Simulate ▶**. Use **⧉ Pop out** to move the output to another window.

Optional: run against the real REST/WebSocket path.

```bash
npm run simulator                     # http://localhost:8787 (HDL Service Contract v1)
# then open http://localhost:5173/?service=http://localhost:8787
# or use the service pill (top right) → HTTP endpoint
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build to `dist/` |
| `npm test` | Unit, system and integration tests (Vitest) |
| `npm run test:e2e` | Builds, serves and runs Playwright tests, including real Surfer and the launch harness |
| `npm run simulator` | Node service simulator (`-- --artefact-urls` returns the VCD by URL) |

## URL parameters

| Parameter | Effect |
|---|---|
| `service=<url>` | Use an HTTP HDL service instead of the in-browser simulator |
| `workspace=fixture` or `workspace=shared` | Force the test-double workspace or the P6A seam |
| `case=HDL-0n` | Preload a published case (test double only) |
| `autorun=1` | Run once on load |
| `openWaveform=1` | Open the Surfer tab after a successful run |
| `launch=<base64url>` | Learning-tool launch context (Launch/Result Contract v1) |

## Project layout

```
src/
  contracts/      HDL Service Contract v1 + Launch/Result Contract v1 types and validators
  workspace/      A-B seam interface, fixture test double, P6A adapter
  service/        REST/WebSocket client and transports (HTTP, embedded simulator)
  run/            request building, category labels, run controller hook
  components/     CodeView, PropertiesPanel, OutputPanel, WaveformView, FileMenu, Dialogs, ServiceSettings
  lib/            small helpers: VCD reader, VHDL colouring and port reading
  popout/         pop-out output window and its BroadcastChannel messages
  surfer/         Surfer iframe and Surfer window integration
  launch/         launch parsing, completion result, published examples
  harness/        local launch/result harness page
  simulator/      parent-project service simulator (engine, job store, VCD writer, fixtures)
simulator/server.ts   Node REST + WebSocket simulator
public/surfer/        self-hosted Surfer WASM build (EUPL-1.2)
tests/{unit,system,integration,e2e}
docs/                 SDD, test documentation, RTM, interface spec, change log, deployment
```

## Ownership

Everything in this repository is P6B work, apart from the joint seam specification in `docs/interface-p6a-p6b.md`. P6A's Monaco editor, live diagnostics and completion are **not** reproduced here. The code view only colours text, and its typing area is a labelled test double for the seam (shown as "test double" in Properties).

## Licences and acknowledgements

- P6B source: MIT (see `LICENSE`).
- Surfer browser build in `public/surfer/`: © the Surfer contributors, EUPL-1.2, unmodified apart from a small wrapper `index.html`. <https://gitlab.com/surfer-project/surfer>
- Layout inspired by VHDLive (vhdl.ai/vhdlive). No VHDLive code or assets are used.
- **AI acknowledgement:** generative AI assistance (Claude) was used for coding, test generation and documentation drafting. The P6B team is responsible for reviewing, testing, understanding and defending all submitted work.
