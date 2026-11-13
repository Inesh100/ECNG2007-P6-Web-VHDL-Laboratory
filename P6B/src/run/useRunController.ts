/**
 * React hook that owns the P6B run workflow: take the current workspace
 * snapshot, submit it, follow progress and keep the terminal result.
 */
import { useCallback, useRef, useState } from 'react';
import type { JobOptions, JobResult, JobStage, JobStatus, LogEntry } from '../contracts/hdlService';
import { HdlServiceClient } from '../service/hdlServiceClient';
import type { WorkspaceSource } from '../workspace/types';
import { buildJobRequest } from './runModel';

export interface RunState {
  phase: 'idle' | 'running' | 'done';
  stage: JobStage;
  status: JobStatus | 'idle';
  jobId?: string;
  logs: LogEntry[];
  job?: JobResult;
  channel?: 'websocket' | 'polling';
  submittedRevision?: number;
  submittedTop?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface HistoryItem {
  jobId: string;
  revision: number;
  status: JobStatus;
  category?: string;
  at: string;
  durationMs: number;
}

const IDLE: RunState = { phase: 'idle', stage: 'queued', status: 'idle', logs: [] };

export function useRunController(workspace: WorkspaceSource, client: HdlServiceClient, onFinished?: (job: JobResult, revision: number) => void) {
  const [state, setState] = useState<RunState>(IDLE);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const runToken = useRef(0);

  const run = useCallback(
    async (options: JobOptions) => {
      const token = ++runToken.current;
      // P6B-FR-04/18: submit exactly the snapshot published through the seam.
      const snapshot = workspace.getSnapshot();
      const req = buildJobRequest(snapshot, options);
      const startedAt = Date.now();
      setState({ phase: 'running', stage: 'queued', status: 'queued', logs: [], submittedRevision: snapshot.revision, submittedTop: snapshot.top, startedAt });
      const live = (patch: (s: RunState) => RunState) => {
        if (token === runToken.current) setState(patch);
      };
      const job = await client.run(req, {
        onAccepted: (a) => live((s) => ({ ...s, jobId: a.jobId })),
        onStage: (stage, status) => live((s) => ({ ...s, stage, status })),
        onLog: (entry) => live((s) => ({ ...s, logs: [...s.logs, entry] })),
        onChannel: (channel) => live((s) => ({ ...s, channel })),
      });
      // Artefacts returned by URL are downloaded once so Surfer can open them locally.
      for (const a of job.artefacts) {
        if (a.kind !== 'vcd' || a.content !== undefined) continue;
        try {
          a.content = await client.fetchArtefact(a);
        } catch (e) {
          job.logs = [...job.logs, { stage: 'service', stream: 'stderr', text: `p6b-client: waveform ${a.name} could not be downloaded: ${(e as Error).message}` }];
          job.artefacts = job.artefacts.filter((x) => x !== a);
        }
      }
      if (token !== runToken.current) return;
      const finishedAt = Date.now();
      setState((s) => ({ ...s, phase: 'done', stage: job.stage, status: job.status, job, jobId: job.jobId, logs: job.logs.length >= s.logs.length ? job.logs : s.logs, finishedAt }));
      setHistory((h) => [
        { jobId: job.jobId, revision: snapshot.revision, status: job.status, category: job.failure?.category, at: new Date(finishedAt).toLocaleTimeString(), durationMs: finishedAt - startedAt },
        ...h,
      ].slice(0, 8));
      onFinished?.(job, snapshot.revision);
    },
    [workspace, client, onFinished],
  );

  const reset = useCallback(() => {
    runToken.current++;
    setState(IDLE);
  }, []);

  return { state, history, run, reset };
}
