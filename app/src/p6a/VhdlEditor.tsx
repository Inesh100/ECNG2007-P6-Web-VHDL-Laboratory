
import { useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import type { Workspace } from "../shared/types";
import FileTabs from "./FileTabs";

interface Props {
  workspace: Workspace;
  onChange: (workspace: Workspace) => void;
}

export default function VhdlEditor({
  workspace,
  onChange
}: Props) {
  const monaco = useMonaco();

  useEffect(() => {
    if (!monaco) return;

    const registered = monaco.languages
      .getLanguages()
      .some((language) => language.id === "vhdl");

    if (!registered) {
      monaco.languages.register({ id: "vhdl" });
    }
  }, [monaco]);

  const activeFile = workspace.files.find(
    (file) => file.id === workspace.activeFileId
  );

  function selectFile(fileId: string) {
    onChange({
      ...workspace,
      activeFileId: fileId
    });
  }

  function updateFile(value: string | undefined) {
    onChange({
      ...workspace,
      files: workspace.files.map((file) =>
        file.id === workspace.activeFileId
          ? { ...file, content: value ?? "" }
          : file
      )
    });
  }

  return (
    <section className="editor-section">
      <FileTabs
        workspace={workspace}
        onSelectFile={selectFile}
      />

      {activeFile && (
        <Editor
          height="100%"
          path={activeFile.name}
          language="vhdl"
          theme="vs-dark"
          value={activeFile.content}
          onChange={updateFile}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false
          }}
        />
      )}
    </section>
  );
}
