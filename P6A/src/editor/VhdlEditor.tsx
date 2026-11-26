/**
 * The Monaco editor for the fixed VHDL file model (P6A-FR-2, P6A-FR-3,
 * P6A-UR-1, P6A-UR-2).
 *
 *   model edits   -> WorkspaceStore.updateFile  (one revision per edit, P6A-FR-6)
 *   store changes -> model (scenario load / reset), as an undoable edit
 *   markers       -> Problems panel + diagnostic counts in the workspace
 *
 * Squiggles, hover tooltips and the completion popup are Monaco's own UI, fed by
 * the language client, so they look and behave exactly as in VS Code.
 */
import { useEffect, useRef } from 'react';
import type * as monacoNs from '@codingame/monaco-vscode-editor-api';
import type { WorkspaceStore } from '../workspace/workspaceStore';
import { getModel, initMonaco, type TextModel } from './monacoSetup';
import { severityFromMarker, type ProblemItem } from './problems';
import { reasonOf } from '../lsp/status';

type Editor = monacoNs.editor.IStandaloneCodeEditor;
type ViewState = monacoNs.editor.ICodeEditorViewState | null;

export interface RevealRequest {
  path: string;
  /** 1-based */
  line: number;
  column: number;
  /** Optionally open the suggest widget or the hover at that position. */
  action?: 'suggest' | 'hover';
  /** Change this to repeat a request for the same position. */
  nonce: number;
}

export interface VhdlEditorProps {
  store: WorkspaceStore;
  activePath: string;
  reveal?: RevealRequest;
  onReady?: () => void;
  onCursor?: (line: number, column: number) => void;
  onProblems?: (items: ProblemItem[]) => void;
  onError?: (message: string) => void;
}

export function VhdlEditor(props: VhdlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | undefined>(undefined);
  const models = useRef(new Map<string, TextModel>());
  const viewStates = useRef(new Map<string, ViewState>());
  const shownPath = useRef<string | undefined>(undefined);
  const applyingFromStore = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const { store } = props;

  // ---------------------------------------------------------------- create once
  useEffect(() => {
    let disposed = false;
    const disposables: Array<{ dispose(): void }> = [];

    void (async () => {
      try {
        const monaco = await initMonaco();
        for (const f of store.getSnapshot().files) models.current.set(f.path, await getModel(f.path, f.content));
        if (disposed || !host.current) return;

        const first = latest.current.activePath;
        const editor = monaco.editor.create(host.current, {
          model: models.current.get(first) ?? null,
          theme: 'vs-dark',
          automaticLayout: true,
          fontSize: 14,
          fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
          tabSize: 2,
          insertSpaces: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          wordBasedSuggestions: 'off',
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestOnTriggerCharacters: true,
          fixedOverflowWidgets: true,
          ariaLabel: 'VHDL editor',
        });
        editorRef.current = editor;
        shownPath.current = first;

        // model -> store: every edit (typing, paste, undo, redo) is one revision
        for (const [path, model] of models.current) {
          disposables.push(
            model.onDidChangeContent(() => {
              if (!applyingFromStore.current) store.updateFile(path, model.getValue());
            }),
          );
        }

        // store -> model: scenario loads and resets, as an undoable edit
        const unsubscribe = store.subscribe((s) => {
          for (const f of s.files) {
            const model = models.current.get(f.path);
            if (!model || model.getValue() === f.content) continue;
            applyingFromStore.current = true;
            try {
              model.pushEditOperations([], [{ range: model.getFullModelRange(), text: f.content }], () => null);
            } finally {
              applyingFromStore.current = false;
            }
          }
        });
        disposables.push({ dispose: unsubscribe });

        // markers -> Problems panel
        const publishProblems = () => {
          const items: ProblemItem[] = [];
          for (const [path, model] of models.current) {
            for (const mk of monaco.editor.getModelMarkers({ resource: model.uri })) {
              items.push({
                path,
                line: mk.startLineNumber,
                column: mk.startColumn,
                severity: severityFromMarker(mk.severity),
                message: mk.message,
                code: typeof mk.code === 'string' ? mk.code : mk.code?.value,
                source: mk.source,
              });
            }
          }
          latest.current.onProblems?.(items);
        };
        disposables.push(monaco.editor.onDidChangeMarkers(publishProblems));
        publishProblems();

        disposables.push(editor.onDidChangeCursorPosition((e) => latest.current.onCursor?.(e.position.lineNumber, e.position.column)));
        latest.current.onCursor?.(1, 1);
        latest.current.onReady?.();
      } catch (err) {
        latest.current.onError?.(reasonOf(err));
      }
    })();

    return () => {
      disposed = true;
      for (const d of disposables) d.dispose();
      editorRef.current?.dispose();
      editorRef.current = undefined;
    };
  }, [store]);

  // ---------------------------------------------------------------- switch file tab
  const show = (path: string) => {
    const editor = editorRef.current;
    const model = models.current.get(path);
    if (!editor || !model || shownPath.current === path) return;
    if (shownPath.current) viewStates.current.set(shownPath.current, editor.saveViewState());
    editor.setModel(model);
    const vs = viewStates.current.get(path);
    if (vs) editor.restoreViewState(vs);
    shownPath.current = path;
  };

  useEffect(() => {
    show(props.activePath);
  }, [props.activePath]);

  // ---------------------------------------------------------------- reveal / scenario cursor
  useEffect(() => {
    const r = props.reveal;
    const editor = editorRef.current;
    if (!r || !editor) return;
    show(r.path);
    const position = { lineNumber: r.line, column: r.column };
    editor.setPosition(position);
    editor.revealPositionInCenter(position);
    editor.focus();
    if (r.action) {
      const id = r.action === 'suggest' ? 'editor.action.triggerSuggest' : 'editor.action.showHover';
      // give the language service a moment to see the new text first
      const t = setTimeout(() => editor.trigger('p6a', id, {}), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [props.reveal?.nonce]);

  return <div ref={host} className="monaco-host" data-testid="monaco-host" />;
}
