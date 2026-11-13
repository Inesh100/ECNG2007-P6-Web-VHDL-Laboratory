
import type { SimulationResult } from "./mockHdlService";

interface ResultsPanelProps {
  result: SimulationResult | null;
  isRunning: boolean;
  error: string | null;
}

export default function ResultsPanel({
  result,
  isRunning,
  error
}: ResultsPanelProps) {
  return (
    <div className="results-panel">
      <h2>Simulation Results</h2>

      {isRunning && (
        <p className="status-running">
          Status: Running...
        </p>
      )}

      {!isRunning && error && (
        <p className="status-failed">
          Service Error: {error}
        </p>
      )}

      {!isRunning && !error && !result && (
        <p>
          No simulation has been run yet.
          Click Run to begin.
        </p>
      )}

      {!isRunning && !error && result && (
        <>
          <p>
            <strong>Job ID:</strong> {result.jobId}
          </p>

          <p>
            <strong>Status: </strong>
            <span
              className={
                result.status === "success"
                  ? "status-success"
                  : "status-failed"
              }
            >
              {result.status.toUpperCase()}
            </span>
          </p>

          <p>
            <strong>Stage:</strong> {result.stage}
          </p>

          <h3>Simulation Logs</h3>

          <pre className="simulation-logs">
            {result.logs.join("\n")}
          </pre>
        </>
      )}
    </div>
  );
}
