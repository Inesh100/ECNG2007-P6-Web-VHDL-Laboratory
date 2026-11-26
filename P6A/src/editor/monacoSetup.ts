/**
 * One-time start-up of Monaco through monaco-languageclient's
 * MonacoVscodeApiWrapper, in CLASSIC mode (plain Monaco editor + Monarch
 * highlighting, with the VS Code services the language client needs).
 *
 * Also registers the VHDL language and provides the in-memory file models of
 * the fixed file model under file:///workspace/<path>.
 */
import { LogLevel } from '@codingame/monaco-vscode-api';
import { createModelReference } from '@codingame/monaco-vscode-api/monaco';
import * as monaco from '@codingame/monaco-vscode-editor-api';
import { MonacoVscodeApiWrapper, getEnhancedMonacoEnvironment } from 'monaco-languageclient/vscodeApiWrapper';
import * as vscode from 'vscode';
import EditorWorker from '@codingame/monaco-vscode-editor-api/esm/vs/editor/editor.worker.js?worker';
import { VHDL_LANGUAGE_ID, vhdlLanguageConfiguration, vhdlLanguageExtension, vhdlMonarch } from './vhdlLanguage';

export type Monaco = typeof monaco;
export type TextModel = monaco.editor.ITextModel;

export const WORKSPACE_ROOT = '/workspace/';

let started: Promise<Monaco> | undefined;

/** Starts the Monaco/VS Code API once per page and registers VHDL. */
export function initMonaco(): Promise<Monaco> {
  started ??= (async () => {
    const wrapper = new MonacoVscodeApiWrapper({
      $type: 'classic',
      viewsConfig: { $type: 'EditorService' },
      logLevel: LogLevel.Warning,
      userConfiguration: {
        json: JSON.stringify({
          'editor.wordBasedSuggestions': 'off',
          'editor.quickSuggestions': { other: true, comments: false, strings: false },
          'editor.suggestOnTriggerCharacters': true,
          'editor.hover.enabled': true,
        }),
      },
      monacoWorkerFactory: () => {
        // The editor's own background worker (text diffing, word ranges, ...).
        const env = getEnhancedMonacoEnvironment();
        env.getWorker = () => new EditorWorker();
      },
    });
    await wrapper.start();

    if (!monaco.languages.getLanguages().some((l) => l.id === VHDL_LANGUAGE_ID)) {
      monaco.languages.register(vhdlLanguageExtension);
    }
    monaco.languages.setMonarchTokensProvider(VHDL_LANGUAGE_ID, vhdlMonarch as monaco.languages.IMonarchLanguage);
    monaco.languages.setLanguageConfiguration(VHDL_LANGUAGE_ID, vhdlLanguageConfiguration as monaco.languages.LanguageConfiguration);
    return monaco;
  })();
  return started;
}

export function fileUri(path: string): vscode.Uri {
  return vscode.Uri.file(WORKSPACE_ROOT + path);
}

const models = new Map<string, Promise<TextModel>>();

/**
 * The text model for one file of the fixed file model. Created once and kept
 * for the whole page (the model reference is never released), so undo history
 * survives tab switches.
 */
export function getModel(path: string, initialText: string): Promise<TextModel> {
  let m = models.get(path);
  if (!m) {
    m = (async () => {
      await initMonaco();
      const ref = await createModelReference(fileUri(path), initialText);
      const model = ref.object.textEditorModel as unknown as TextModel | null | undefined;
      if (!model) throw new Error(`Could not create the editor model for ${path}`);
      if (model.getValue() !== initialText) model.setValue(initialText);
      if (model.getLanguageId() !== VHDL_LANGUAGE_ID) monaco.editor.setModelLanguage(model, VHDL_LANGUAGE_ID);
      return model as unknown as TextModel;
    })();
    models.set(path, m);
  }
  return m;
}
