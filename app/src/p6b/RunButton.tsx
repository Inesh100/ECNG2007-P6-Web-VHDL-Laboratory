
interface RunButtonProps {
  onRun: () => void;
  isRunning: boolean;
}

export default function RunButton({
  onRun,
  isRunning
}: RunButtonProps) {
  return (
    <button
      className="run-button"
      type="button"
      onClick={onRun}
      disabled={isRunning}
    >
      {isRunning ? "Running..." : "▶ Run"}
    </button>
  );
}
