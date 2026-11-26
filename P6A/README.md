# Web VHDL Laboratory: P6A Editor & Language Features

ECNG 2007 Software Development Lifecycle Project 2026/27 · Group 6 · **Subproject P6A**

P6A is the editing side of the P6 Web VHDL Laboratory. It opens the prescribed introductory VHDL file model in the **Monaco** editor. Live **diagnostics, completion and hover** come from a VHDL language server through **monaco-languageclient**. P6A is also the **owner and writer of the shared workspace** that P6B reads to run simulations and show waveforms.

| | |
|---|---|
| Stack | React 19 · TypeScript 7 · Vite 8 · Monaco (`@codingame/monaco-vscode-editor-api`) · monaco-languageclient 11 · vscode-languageserver 10 |
| Pairs with | P6B Run, Results & Waveforms, through the shared workspace seam [IF-P6-WS-01](../P6B/docs/interface-p6a-p6b.md) |
| Docs | [Design](docs/SDD-P6A.md) · [Approved scenarios](docs/language-service-scenarios.md) · [Test documentation](docs/test-documentation-P6A.md) |

P6A works and is tested on its own. It needs no P6B, Project 5 or Project 7 implementation (P6-StR3.1).

## What it does

- **VS Code-like editor** (P6-StR1.1): explorer, file tabs, Monaco with VHDL highlighting, bracket matching, auto-closing, comment toggling (`Ctrl+/`), multi-cursor, find/replace, and undo/redo per file. The file model is fixed: `src/counter.vhd` (design) and `tb/tb_counter.vhd` (testbench, top `tb_counter`).
- **Diagnostics, completion, hover** (P6-StR1.2): red/yellow squiggles with hover messages, a **PROBLEMS** panel (click a problem to jump to it), a completion popup (`Ctrl+Space`, or automatically after `.`), and hover on any declared name.
- **Approved scenarios** (P6-AC1.2): **Scenarios ▾** loads each published case (LSP-01 to LSP-12) into the editor. The **APPROVED SCENARIO** tab shows the approved response and checks it against what is displayed: ✔ matches / ✖ does not match.
- **Language-service status** (P6A-FR-7): the status bar shows *ready / connecting / unavailable*. If the service is refused, times out, errors or crashes, the editor stays fully editable, a banner explains why, and **Retry** reconnects.
- **Shared workspace for P6B** (P6-StR4.1): every edit publishes a new revision on `window.__P6_WORKSPACE__` and `BroadcastChannel('p6-workspace-v1')`. The **Run & Results** panel on the right is the real P6B app, reading this editor's state. You edit, press **Simulate ▶** in P6B, and see the result and waveform, with nothing re-entered by hand (P6-AC4.1).

## Quick start

```bash
cd P6A
npm install
npm run dev            # http://localhost:5174 (editor + in-browser language service)
```

To see P6B inside the editor page, build P6B once. The P6A dev server then serves it at `/P6B/`:

```bash
cd ../P6B && npm install && npm run build && cd ../P6A
npm run dev
```

Or build the whole lab (P6A with P6B inside) and preview the production build:

```bash
npm run build:lab
npm run preview        # http://localhost:4174
```

> If the Vite dev server has trouble loading Monaco's workers, use `npm run build && npm run preview`. The monaco-languageclient documentation recommends this too.

## Language service options

| URL | Effect |
|---|---|
| *(nothing)* | In-browser **language-service simulator** in a Web Worker (default; used for independent testing, P6-AC3.1) |
| `?lsp=ws://localhost:8790/vhdl` | Real LSP over WebSocket: the Node simulator (`npm run lsp-server`), or a Project 5 VHDL-LS gateway |
| `?lsp=off` | No language service (editor only) |
| `?lspFault=refuse\|timeout\|error\|crash` | Fault injection for IT-LSP-02 (worker transport; for WebSocket use `npm run lsp-server -- --fault <x>`) |
| `?lspTimeout=<ms>` | Start-up timeout, default 5000 |
| `?scenario=LSP-02` | Load an approved scenario on start-up |
| `?run=0` | Start with the P6B panel hidden (`Ctrl+Shift+R` toggles it) |
| `?p6b=<url>` | Load P6B from another same-origin location |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server (port 5174) |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run build:lab` | Build P6B and P6A together into `dist/` (P6B at `dist/P6B/`) |
| `npm run preview` | Serve the production build (port 4174) |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run lsp-server` | Node WebSocket language-service simulator on `ws://localhost:8790/vhdl` |

## Project layout

```
src/
  files/            the fixed reference file model (src/counter.vhd, tb/tb_counter.vhd)
  workspace/        IF-P6-WS-01 types and the P6A owner/publisher (DE-A-06)
  editor/           Monaco start-up, VHDL highlighting, the editor component, problems model
  lsp/              language client over monaco-languageclient (DE-A-04), status (DE-A-05), settings
  languageService/  language-service simulator: lexer, analyzer, completion/hover,
                    approved scenarios, LSP server, Web Worker entry
  components/       explorer, tabs, problems/scenario/output panel, status bar, P6B run panel
simulator/server.ts Node WebSocket host for the same language server
tests/{unit,integration}
docs/               design, approved scenarios, test documentation
```

## Ownership

Everything in `P6A/` is P6A work. P6A does not import or modify P6B code. Two integration tests read P6B's files in read-only mode to prove the seam: `tests/integration/seam.test.ts` uses P6B's real `SharedWorkspace` reader, and `tests/integration/p6bFixtures.test.ts` uses P6B's published HDL cases. The language-service simulator is a **test double** for the Project 5 VHDL-LS gateway, not a VHDL compiler.

## Licences and acknowledgements

- P6A source: MIT.
- Monaco Editor and VS Code API packages (`@codingame/monaco-vscode-*`), monaco-languageclient and vscode-languageserver: MIT, © their authors.
- **AI acknowledgement:** generative AI assistance (Claude) was used for coding, test generation and documentation drafting. The P6A team is responsible for reviewing, testing, understanding and defending all submitted work.
