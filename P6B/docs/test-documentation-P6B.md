# Software Test Documentation: P6B Run, Results & Waveforms

ECNG 2007 Group 6, Subproject P6B · Version 1.1 · Informed by ISO/IEC/IEEE 29119-3:2021

## 1. Test plan

| Item | Value |
|---|---|
| Test item | P6B web client (`src/`), local launch/result harness (`harness.html`), parent-project service simulator (`src/simulator`, `simulator/server.ts`) |
| Basis | System tests come from the P6B SRS. Integration tests come from the SDD interfaces (A–B seam, HDL service REST/WS). Unit tests come from the detailed design and code. |
| Independence | Every test runs without P6A, Project 5 or Project 7 (ECO-StR6.1). Doubles: `FixtureWorkspace`, the writer stand-in in IT-SEAM-01, `EmbeddedTransport` and `JobStore`, the Node simulator, and the launch harness. |
| Tools | Vitest 2 + Testing Library (jsdom) for unit, system and integration. Playwright 1.63 (Chromium) for end-to-end against the production build with the real Surfer WASM. |
| Fixtures | `src/simulator/fixtures.ts` (HDL-01..08), `src/launch/examples.ts` (LTR-01..04). These are stand-ins for the staff fixtures (CR-P6B-02). |
| Entry criteria | `npm run typecheck` passes. |
| Exit criteria | All planned cases pass. Every P6B SRS requirement traces to at least one passing case (see RTM). No open severity-1 or severity-2 defects. |
| How to run | `npm test` (unit, system, integration) · `npm run test:e2e` (builds, serves and runs Playwright) · CI runs both on every push (`.github/workflows/ci.yml`) |

## 2. System test cases (black box, from the SRS)

| Test ID | Requirement(s) | Input / steps | Expected result | Result |
|---|---|---|---|---|
| SYS-TC-01 | FR-01, FR-05, FR-10, FR-12 | Load HDL-01 (reference) and run | Banner "Succeeded"; Waveform tab enabled | Pass |
| SYS-TC-02 | FR-06, UR-01 | HDL-02 (missing `;`) | Badge text "Analysis failure", category `analysis`; Waveform disabled | Pass |
| SYS-TC-03 | FR-06, UR-01 | HDL-03 (unknown `work.countr`) | "Analysis failure" | Pass |
| SYS-TC-04 | FR-07, UR-01 | HDL-04 (WIDTH 8 onto a 4-bit port) | "Elaboration failure" | Pass |
| SYS-TC-05 | FR-07 | HDL-05 (top `tb_count` missing) | "Elaboration failure" | Pass |
| SYS-TC-06 | FR-08, UR-01 | HDL-06 (assert severity failure) | "Simulation failure" | Pass |
| SYS-TC-07 | FR-09, UR-01 | HDL-07 (5 ms over the 1 ms limit) | "Service/runtime failure" | Pass |
| SYS-TC-08 | FR-14 | HDL-08 (success, no VCD) | "Succeeded"; Waveform tab disabled | Pass |
| SYS-TC-09 | FR-05, UR-02 | Run the reference | "Running" banner during the run; all four steps passed at the end | Pass |
| SYS-TC-10 | FR-11, UR-02 | HDL-02 | Problems lists `';' is expected here` at `src/counter.vhd:27`; Logs contains `ghdl -a --std=08 src/counter.vhd` | Pass |
| SYS-TC-11 | FR-10 | HDL-01 | Results shows 250 ns, the testbench report and the `tb_counter.vcd` link | Pass |
| SYS-TC-12 | FR-09 | Fault injection: service unavailable (503) | "Service/runtime failure"; "Your VHDL may be fine" | Pass |
| SYS-TC-13 | FR-04, FR-18, FR-19 | Edit the testbench through the fixture double, then run | Request carries the new revision and edited content; header revision matches; stale notice after a later edit | Pass |
| SYS-TC-14 | FR-15, FR-16 | Launched with LTR-01 and run HDL-01; launched with an invalid context | `p6b.result` posted (completed, score 1, same `launchId`); an invalid launch shows an alert and sends nothing | Pass |
| SYS-TC-15 | UR-02, UR-03 (CR-P6B-04) | Press ⧉ Pop out; the pop-out side sends hello, then run, then bye | `popout.html` window opened; output leaves the main page; state streamed (final status succeeded); output returns after bye | Pass |
| E2E-01 | FR-12, FR-13, IR-04, UR-03 | Production build in Chromium: run HDL-01; check the quick view, then open the Surfer tab | Quick view lists `count_r`; Surfer reports the VCD loaded (`waves_loaded()`); canvas visible; "Waveform open in Surfer" | Pass |
| E2E-02 | FR-06..09 | Production build: HDL-02, 04, 06, 07 | Correct category text; Waveform disabled | Pass (4/4) |
| E2E-04 | UR-02, UR-03 (CR-P6B-04) | Real pop-out window: run, pop out, re-run from the pop-out, click a problem in the pop-out, dock | Pop-out shows Succeeded; Runs (2) after the re-run; the clicked problem highlights line 27 in the main window; output returns on Dock | Pass |
| E2E-03 | FR-17, IR-06, P6-AC2.2 | Harness → "Run all examples" | 4/4 passed: LTR-01 completed/1, LTR-02 incomplete/0, LTR-03 completed after the waveform opened, LTR-04 rejected with no result | Pass |

## 3. Integration test cases (from the SDD interfaces)

| Test ID | Interface | Description | Result |
|---|---|---|---|
| IT-SEAM-01 | IF-P6-WS-01 (A–B seam) | A writer stand-in publishes revision 2 (broken) and revision 3 (fixed) through `window.__P6_WORKSPACE__`. P6B submits exactly the published files, `sessionId` and revision; shows "Analysis failure" and then "Succeeded" with the waveform enabled. | Pass |
| IT-SVC-01 | HDL Service v1 REST | `GET /api/v1/health` on the Node simulator returns contract 1.0 | Pass |
| IT-SVC-02 | HDL Service v1 WebSocket | Reference job followed over a real WebSocket to `completed`, with the VCD inline | Pass |
| IT-SVC-03 | HDL Service v1 REST/WS | All 8 HDL cases over real HTTP give the expected status and category | Pass (8/8) |
| IT-SVC-04 | Artefact endpoint | Simulator in `--artefact-urls` mode; the client downloads the VCD from `/artefacts/tb_counter.vcd` | Pass |
| IT-SVC-05 | Transport | Refused connection becomes a service/runtime failure | Pass |

## 4. Unit test cases (from the detailed design)

| Group | Unit | Cases | Result |
|---|---|---|---|
| UT-SIM-01..07 | `simulator/engine`, `vcd` | Time parsing; comment stripping; analysis rules (`;`, `end if`, brackets, unknown entity); elaboration (top, widths); VCD content (wrap at 175 ns, edits change edge times, no artefact when not requested); service limits; all HDL cases | Pass (24) |
| UT-CLI-01..04 | `service/hdlServiceClient` | Polling path; WebSocket path; 503, malformed, network, non-JSON and timeout all become `service`; inline and URL artefacts | Pass (8) |
| UT-RUN-01..04 | `run/runModel` | Request copies the snapshot unchanged; category labels; stepper states, including service failures not blaming a stage; `hasWaveform` | Pass (8) |
| UT-CON-01..03 | `contracts/*` | `validateJobResult`, `validateLaunchContext`, `validateCompletionResult` | Pass (8) |
| UT-LTR-01..03 | `launch/launch` | base64url round trip (non-ASCII too); parse and reject; completion rules; postMessage target origin | Pass (7) |
| UT-LIB-01..02 | `lib/vcdParser`, `lib/vhdl` | VCD header, scopes and values over time; decimal formatting; syntax token kinds; entity and port reading | Pass (5) |
| UT-WS-01..02 | `workspace/*` | Fixture revisions and subscribers; shared adapter follows the owner and drops stale revisions; fallback when no seam | Pass (4) |

## 4a. Inspections (design constraints)

| ID | Constraint | What was checked | Result |
|---|---|---|---|
| INSP-01 | DC-01 React/TS/Vite | `package.json`, `vite.config.ts`, `tsconfig.json` (strict) | Pass |
| INSP-02 | DC-02 REST/WebSocket | `service/transport.ts` uses `fetch` and `WebSocket` only | Pass |
| INSP-03 | DC-03 browser Surfer | `public/surfer/` is the upstream Surfer WASM build (EUPL-1.2), driven only through its documented URL parameters | Pass |
| INSP-04 | DC-04 parent simulator | No Project 5 code or endpoint is needed by any test | Pass |
| INSP-05 | DC-05 VHDL only | No other HDL is accepted or offered | Pass |
| INSP-06 | DC-06 no accounts or cloud storage | Only `localStorage` for the chosen service URL; static hosting | Pass |
| INSP-07 | DC-07 seam | P6B imports nothing from P6A; the only coupling is IF-P6-WS-01 | Pass |
| INSP-08 | SA-01 substitutability | Each external dependency has an interface plus a double | Pass |

## 5. Execution summary (2 Nov 2026)

```
Vitest   Test Files 11 passed (11)   Tests 94 passed (94)
Playwright  7 passed (E2E-01, E2E-02 x4, E2E-03, E2E-04)
TypeScript  tsc --noEmit: 0 errors
```

The CI workflow reruns all of the above on each push. Its run history is the ongoing regression record.

## 6. Defects and corrective actions

| Defect | Found by | Severity | Description | Fix | Regression |
|---|---|---|---|---|---|
| DEF-01 | Manual browser run, then E2E | 1 | In the browser every run ended as "Service/runtime failure: Illegal invocation". `JobStore` called the default `setTimeout` as a method (`this.schedule`), which Chrome rejects. Node accepted it, so unit tests did not catch it. | Default scheduler wraps the call: `(fn, ms) => setTimeout(fn, ms)` | E2E-01, E2E-02 pass in Chromium |
| DEF-02 | Code review during DEF-01 | 2 | The embedded base URL used a custom scheme (`sim://`). Some Chromium versions parse the path of non-special URLs differently, which could break routing. | Base URL changed to `http://service-simulator.p6b.invalid` (reserved TLD, never resolved) | UT-CLI-02, SYS-TC-01..14 |
| DEF-03 | Simulator smoke test | 3 | Statements at exactly the stop time (the `report` at 200 ns with a 200 ns stop) were skipped. | Loop condition changed to `t > stop`; default stop time set to 250 ns so the self-check is visible | UT-SIM-05 (report present) |
| DEF-04 | Screenshot review | 3 | After a failed run that followed a waveform view, the UI stayed on Results instead of opening Problems. | Tab selection now checks "failed with diagnostics" first | SYS-TC-10 |
| DEF-05 | Screenshot review | 4 | Code-font ligatures drew VHDL `<=` and `=>` as arrows, which misrepresents the source. | Ligatures turned off for code, logs and source | Visual check |
| DEF-06 | Unit test | 4 | UT-SIM-02 expected value was wrong (test defect, not product). | Corrected the expected padding | UT-SIM-02 |
| DEF-07 | Screenshot review (v1.1) | 4 | DEF-05 came back in the new code view: the CSS `font` shorthand resets `font-variant-ligatures`, so `<=` showed as an arrow again. | Ligatures turned off after the shorthand for code, console and waveform names | Visual check |
| DEF-08 | System test (v1.1) | 4 | SYS-TC-13 still expected the old stale-results wording after the UI rewrite (test defect). | Updated the expected text | SYS-TC-13 |

## 7. Coverage of the P6B stakeholder requirements

| StR / AC | Evidence |
|---|---|
| P6-StR2.1 / P6-AC2.1 (success/failure display, waveform opens) | SYS-TC-01..12, SYS-TC-15, E2E-01, E2E-02, E2E-04 |
| P6-StR2.2 / P6-AC2.2 (launch/result with local harness, no Project 7) | SYS-TC-14, UT-LTR-*, UT-CON-02/03, E2E-03 |
| P6-StR3.1 / P6-AC3.1 (contract scenarios without Project 5) | IT-SVC-01..05, UT-CLI-*, UT-CON-01, UT-SIM-07 |
| P6-StR4.1 / P6-AC4.1 (joint: edit, run, view) | IT-SEAM-01, SYS-TC-13. Final joint demonstration happens at Week 11 with the real P6A. |
