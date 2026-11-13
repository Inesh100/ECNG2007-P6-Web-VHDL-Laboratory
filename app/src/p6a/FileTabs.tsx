
import type { Workspace } from "../shared/types";

interface Props {
  workspace: Workspace;
  onSelectFile: (fileId: string) => void;
}

export default function FileTabs({
  workspace,
  onSelectFile
}: Props) {
  return (
    <div className="file-tabs">
      {workspace.files.map((file) => (
        <button
          key={file.id}
          type="button"
          className={
            workspace.activeFileId === file.id
              ? "file-tab active"
              : "file-tab"
          }
          onClick={() => onSelectFile(file.id)}
        >
          {file.name}
        </button>
      ))}
    </div>
  );
}
