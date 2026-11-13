# P6A ↔ P6B Internal Interface: Shared Workspace/Session Model v1

| Field | Value |
|---|---|
| Identifier | IF-P6-WS-01 |
| Owner (writer) | P6A Editor & Language Features |
| Consumer (reader) | P6B Run, Results & Waveforms |
| Direction | One-way, P6A → P6B (P6A-IR-1, P6B-IR-01) |
| Status | Proposed for the Week 5 parent baseline. Changes after baseline need a CR. |
| Satisfies | P6-StR4.1 / P6-AC4.1, P6B-FR-03, P6B-FR-04, P6B-FR-18, P6B-FR-19, P6B-DC-07 |

This document describes only the seam. It does not specify how P6A builds its editor. P6B has no code from P6A and does not import it.

## 1. Data model

```ts
interface WorkspaceFile {
  path: string;                    // e.g. "src/counter.vhd", per Course HDL Artefact Convention v1
  role: 'design' | 'testbench';
  content: string;                 // full text, exactly as in the editor
}

interface WorkspaceSnapshot {
  sessionId: string;               // stable for the browser session
  revision: number;                // incremented by P6A on every edit
  top: string;                     // top-level testbench entity, e.g. "tb_counter"
  files: WorkspaceFile[];          // the prescribed, fixed file set
  diagnostics?: { errors: number; warnings: number };  // optional, display only
  updatedAt: string;               // ISO 8601
}
```

Source: `src/workspace/types.ts`.

## 2. Transport

P6A publishes snapshots through either or both channels.

1. **Same page:** P6A sets `window.__P6_WORKSPACE__ = { getSnapshot(): WorkspaceSnapshot, subscribe(fn): () => void }`. `subscribe` calls `fn` after each edit and returns an unsubscribe function.
2. **Separate tab or frame:** P6A posts `{ type: 'snapshot', snapshot }` on `BroadcastChannel('p6-workspace-v1')` after each edit and replies to `{ type: 'request-snapshot' }` with the current snapshot.

## 3. Rules

| Rule | Meaning |
|---|---|
| R1 | Only P6A writes. P6B never changes source state. |
| R2 | P6B submits `files`, `top`, `sessionId` and `revision` unchanged in the HDL job request. There is no manual restructuring. |
| R3 | `revision` only goes up within a `sessionId`. P6B ignores older revisions. |
| R4 | P6B shows the revision it ran. If the workspace changes after a run, P6B marks the results as stale. |
| R5 | If no P6A seam is present, P6B uses `FixtureWorkspace` (test double, P6B-FR-19). `?workspace=fixture` or `?workspace=shared` forces one or the other. |

## 4. Verification

| Test | Level | What it checks |
|---|---|---|
| UT-WS-01 | Unit | The fixture double publishes revisions and notifies subscribers |
| UT-WS-02 | Unit | The P6B adapter reads `window.__P6_WORKSPACE__`, follows updates and drops stale revisions |
| IT-SEAM-01 | Integration | A writer stand-in edits the source, P6B runs it, and the request equals the published snapshot (revision 2, then 3) |
| SYS-TC-13 | System | The edited revision is the one submitted; results are marked stale after a later edit |

## 5. P6A integration checklist (joint, Week 11)

1. P6A exposes `window.__P6_WORKSPACE__` on the page that hosts both components, or uses the BroadcastChannel.
2. Load the P6B page. The workspace header should say **P6A editor (shared workspace)** with no "test double" chip.
3. Edit the reference source in P6A, press **Run simulation** in P6B, and check that the revision numbers match.
4. Run the reference case and check that the waveform opens (P6-AC4.1).
