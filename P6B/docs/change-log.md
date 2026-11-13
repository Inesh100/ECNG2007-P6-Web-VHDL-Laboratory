# P6B Change Log and Change Requests

The baselines are the Week 5 SRS and IF-P6-WS-01. A material change after baseline is recorded here and in the issue tracker under the label `P6B` or `joint`.

| CR ID | Date | Requester | Requested change and reason | Affected IDs | Impact | Decision / status |
|---|---|---|---|---|---|---|
| CR-P6B-01 | 2026-11-02 | P6B | The frozen staff texts of HDL Service Contract v1 and Learning Tool Launch/Result Contract v1 were not in the files available to the team. P6B implemented working copies in `src/contracts/*.ts` (fields, endpoints, states, categories). When the staff texts are applied, these two files are reconciled. The rest of the code follows through the type checker. | P6B-FR-02, FR-15, FR-16, IR-02, IR-05 | Low: two files plus the fixtures; tests rerun | Open. Awaiting staff contract texts. |
| CR-P6B-02 | 2026-11-02 | P6B | The staff HDL cases, VCD reference artefact and launch/result examples (P6B-AD-01) were not available. Stand-ins were authored: HDL-01..08 and LTR-01..04. They will be replaced with staff fixtures on release, as the course fairness rule allows. | P6B-FR-05, FR-13, FR-17, AD-01 | Low: fixture files only | Open. Awaiting staff fixtures. |
| CR-P6B-03 | 2026-11-02 | P6B | SRS errata, raised for the joint SRS owners. (a) The ID P6B-FR-05 is used twice (run workflow against the simulator; stage/status display). Proposal: renumber the second to P6B-FR-05b and shift later IDs, or keep and suffix. The RTM uses "(run workflow)" and "(stage display)". (b) P6B-FR-14 has no Source/Ownership/Verification. Proposal: Source P6-StR2.1/P6-AC2.1, Owner P6B, Verification System Test. (c) The document control lists student ID 816047047 for both Anderson Sonny and Marcus Lalman; the title page gives Marcus Lalman 816044802. | SRS §3.1.2–3.1.4, document control | Documentation only | Proposed. Needs parent-team agreement. |

| CR-P6B-04 | 2026-11-02 | P6B (Jake) | Rebuild the UI to match the layout of VHDLive (vhdl.ai/vhdlive), keep the code simple for second-year students, and let the output panel pop out into its own window. No requirement changes: the same P6B requirements are met, and UR-02 and UR-03 get better evidence. | P6B-UR-02, UR-03; SDD §5.3, DD-07..09; tests SYS-TC-15, E2E-04, UT-LIB | Medium: UI layer rewritten; contracts, simulator and client unchanged except a simpler client | Approved by P6B and implemented in v1.1 |

## Release history

| Version | Date | Summary |
|---|---|---|
| 1.1.0 | 2026-11-02 | VHDLive-style layout (File menu, file tabs, code view, Properties, output tabs, run bar, welcome tour), built-in SVG waveform preview, Surfer tab and Surfer ↗ window, pop-out output window, clickable problems that highlight the line, simpler service client. |
| 1.0.0 | 2026-11-02 | First complete P6B: run workflow, four failure categories, logs and problems, Surfer waveform, launch/result hook and harness, service simulator (browser and Node), unit/system/integration/E2E tests, CI and deployment. |
