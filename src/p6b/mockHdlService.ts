
import type { Workspace } from "../shared/types";

export interface SimulationResult {
  jobId: string;
  status: "success" | "failed";
  stage: "analysis" | "elaboration" | "simulation";
  logs: string[];
}

export async function runMockSimulation(
  workspace: Workspace
): Promise<SimulationResult> {

  // Simulate the HDL service taking time to respond
  await new Promise<void>((resolve) =>
    setTimeout(resolve, 1500)
  );

  // Check if any VHDL file is empty
  const emptyFile = workspace.files.find(
    (file) => file.content.trim() === ""
  );

  if (emptyFile) {
    return {
      jobId: `mock-${Date.now()}`,
      status: "failed",
      stage: "analysis",
      logs: [
        `Error: ${emptyFile.name} is empty.`,
        "VHDL analysis failed."
      ]
    };
  }

  // Return a simulated successful simulation
  return {
    jobId: `mock-${Date.now()}`,
    status: "success",
    stage: "simulation",
    logs: [
      `Received ${workspace.files.length} VHDL file(s).`,
      ...workspace.files.map(
        (file) => `Submitted: ${file.name}`
      ),
      "VHDL analysis completed.",
      "Elaboration completed.",
      "Simulation completed successfully."
    ]
  };
}
