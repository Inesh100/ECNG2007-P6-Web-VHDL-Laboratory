# P6A Test Documentation

Covers P6A's unit and integration tests and the browser system tests. It also lists P6A's part of the System Integration Test Specification v1.0 (IT-SEAM-02, IT-SEAM-03, IT-LSP-01, IT-LSP-02), which was blocked there because DE-A-04, DE-A-05 and DE-A-06 did not exist yet.

## 1. Environment

| Item | Baseline |
|---|---|
| Runtime | Node.js 22, npm 10 |
| Unit / integration | Vitest 5, Node environment (`npm test`) |
| Language service | P6A language-service simulator (Worker in the browser, Node WebSocket via `npm run lsp-server`) |
| Seam reader | Recording BroadcastChannel reader; P6B's real `SharedWorkspace` adapter (read-only import) |
| Browser | Current Chromium, Firefox or Edge; `npm run build:lab` + `npm run preview` |

## 2. Automated tests (`npm test`)

| File | Tests | What it checks | Requirements |
|---|---|---|---|
| `tests/unit/analyzer.test.ts` | UT-LS-01..06 | Lexer; reference files are clean; each check (`;`, blocks, names, undeclared, parens, case-insensitivity); symbol table | P6A-FR-4, P6A-FR-5 |
| `tests/unit/scenarios.test.ts` | IT-LSP-01 (fixture level) | Every approved scenario LSP-01..12 gives exactly its approved diagnostics / completions / hover | P6-AC1.2, P6A-FR-4 |
| `tests/unit/completion.test.ts` | UT-LS-07..09 | Ranking, snippets, `all` after a package, hover on ports and library names | P6-StR1.2, P6A-UR-2 |
| `tests/unit/workspaceStore.test.ts` | UT-WSA-01..05 | Snapshot shape, `revision + 1` per edit, diagnostics with the same revision, fixed file model, both transports, readers cannot write (R1) | P6A-FR-6, P6A-IR-1 |
| `tests/unit/lspSupport.test.ts` | UT-LSC-01..04 | URL settings, status model and Retry, timeout helper, Problems ordering | P6A-FR-7 |
| `tests/integration/languageServer.test.ts` | IT-LSP-01 / IT-LSP-02 (server side) | LSP capabilities; publishes each scenario after `didChange` within 1.0 s; completion/hover requests; unopened files; `didClose`; `timeout`, `error` and `crash` faults | P6A-FR-5, P6A-FR-7, P6A-PR-1 |
| `tests/integration/seam.test.ts` | IT-SEAM-02; IT-SEAM-03 (code level) | Recording reader procedure from SIT §3.2; P6A writer with P6B's real reader, same page and BroadcastChannel only (`?workspace=shared`) | P6A-FR-6, P6B-FR-03/18, P6-StR4.1 |
| `tests/integration/p6bFixtures.test.ts` | IT-AGREE-01 | P6A shows errors for exactly the P6B HDL cases that fail at analysis (HDL-02, HDL-03), and none for HDL-01, 04-08 | P6-StR4.1 |

## 3. System tests (browser)

Run on `npm run build:lab && npm run preview` (http://localhost:4174), unless a different URL is given.

| ID | Procedure | Expected result | Requirements |
|---|---|---|---|
| SYS-A-01 | Open the page | Explorer lists `src/counter.vhd` and `tb/tb_counter.vhd`. Both tabs open. VHDL is highlighted. The status bar shows **ready**. `ⓧ 0 ⚠ 0` | P6A-FR-1, FR-2, P6-AC1.1 |
| SYS-A-02 | Type, select, cut/paste, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+/` in both files; switch tabs | All work as in VS Code. Undo history is kept per file across tab switches. `rev` in the status bar goes up by one per edit, and not on a tab switch | P6A-FR-3, P6A-UR-1 |
| SYS-A-03 | Scenarios ▾ → LSP-02 … LSP-08 | Squiggle on the approved line. Hover shows the approved message. PROBLEMS lists it. APPROVED SCENARIO shows **✔ matches** | P6-AC1.2, P6A-FR-4 |
| SYS-A-04 | Scenarios ▾ → LSP-09, LSP-10, LSP-11 | The completion popup opens with the approved items | P6-AC1.2 |
| SYS-A-05 | Scenarios ▾ → LSP-12 | The hover shows `signal count_r : unsigned(WIDTH - 1 downto 0)` | P6-AC1.2 |
| SYS-A-06 | Delete a `;`, stop typing, time it | The squiggle appears within 1.0 s after a 500 ms pause | P6A-PR-1 |
| SYS-A-07 | Open with `?lspFault=refuse`, then `timeout`, `error`, `crash` | The editor stays editable. The banner and status bar say **unavailable** with the reason (`crash`: after about 3 s). **Retry** on a normal URL clears it | P6A-FR-7, IT-LSP-02 |
| SYS-A-08 | `npm run lsp-server`, open `?lsp=ws://localhost:8790/vhdl`, repeat SYS-A-03; stop the server | Same results over WebSocket. Stopping the server gives **unavailable** | P6A-FR-5, P6A-DC-02 |

## 4. P6A part of the System Integration Test Specification v1.0

| SIT test | P6A coverage | How to run |
|---|---|---|
| IT-SEAM-02 | Automated: `tests/integration/seam.test.ts` (recording reader on `p6-workspace-v1`: initial snapshot, one character, undo, tab switch, request-snapshot) | `npm test` |
| IT-SEAM-03 | Automated at code level (P6A writer → P6B `SharedWorkspace`). End to end in the browser: open the lab, remove the `;` at `src/counter.vhd` line 32 (or load LSP-02), press **Simulate ▶** in the P6B panel → **Analysis failure** on line 32, with P6B showing P6A's revision. **Reset files**, Simulate → **Succeeded**. Open the Surfer tab → reference waveform | `npm run build:lab && npm run preview` |
| IT-LSP-01 | Automated at fixture and protocol level; browser: SYS-A-03..06 | `npm test`; browser |
| IT-LSP-02 | Automated server side (timeout, error, crash); browser: SYS-A-07 (all four faults incl. refuse) | `npm test`; browser |

Open item R-02 (file model mismatch) is closed: P6A now uses `src/counter.vhd`, `tb/tb_counter.vhd`, top `tb_counter`, as in IF-P6-WS-01.

## 5. Execution record

| Run | Date | Result |
|---|---|---|
| Unit + integration (8 files) | 25 Nov 2026 | 68/68 passed. Executed offline with the Node 22 test runner and TypeScript 7.0.2, because npm packages could not be installed in the authoring environment. CI runs the same files with Vitest on every push |
| TypeScript (core modules and tests) | 25 Nov 2026 | 0 errors (`tsc` 7.0.2, strict) |
| Browser system tests SYS-A-01..08, IT-SEAM-03 (browser) | — | **Not Run**: to be run by the P6A team after `npm install` (see §3) |

## 6. Regression scope

| If this changes | Rerun |
|---|---|
| Reference files or scenarios | `scenarios.test.ts`, `languageServer.test.ts`, `p6bFixtures.test.ts`, SYS-A-03..05 |
| IF-P6-WS-01 fields or rules | `workspaceStore.test.ts`, `seam.test.ts`, IT-SEAM-03 |
| monaco-languageclient / Monaco versions | `npm run build`, SYS-A-01..08 |
| Language-service checks | `analyzer.test.ts`, `p6bFixtures.test.ts` |
