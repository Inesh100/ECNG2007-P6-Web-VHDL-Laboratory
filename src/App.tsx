
import { useState } from "react";

import VhdlEditor from "./p6a/VhdlEditor";

import RunButton from "./p6b/RunButton";
import ResultsPanel from "./p6b/ResultsPanel";

import {
  runMockSimulation
} from "./p6b/mockHdlService";

import type {
  SimulationResult
} from "./p6b/mockHdlService";

import { initialWorkspace } from "./shared/sampleFiles";
import type { Workspace } from "./shared/types";

import "./App.css";

function App() {
  // Shared VHDL workspace owned by P6A
  const [workspace, setWorkspace] =
    useState<Workspace>(initialWorkspace);

  // P6B simulation state
  const [result, setResult] =
    useState<SimulationResult | null>(null);

  const [isRunning, setIsRunning] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  // P6B: Start a simulation job
  async function handleRun() {
    if (isRunning) return;

    setIsRunning(true);
    setResult(null);
    setError(null);

    // Capture the exact source at the moment Run is clicked
    const workspaceSnapshot = structuredClone(workspace);

    try {
      const simulationResult =
        await runMockSimulation(workspaceSnapshot);

      setResult(simulationResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An unknown service error occurred."
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Web VHDL Laboratory</h1>
        <span>ECNG2007 — Project P6</span>
      </header>

      <main className="main-layout">

        {/* P6A Editor */}
        <div className="editor-panel">
          <div className="panel-header">
            <h2>VHDL Editor</h2>

            {/* P6B Run Button */}
            <RunButton
              onRun={handleRun}
              isRunning={isRunning}
            />
          </div>

          <VhdlEditor
            workspace={workspace}
            onChange={setWorkspace}
          />
        </div>

        {/* P6B Results Panel */}
        <ResultsPanel
          result={result}
          isRunning={isRunning}
          error={error}
        />

      </main>
    </div>
  );
}

export default App;
