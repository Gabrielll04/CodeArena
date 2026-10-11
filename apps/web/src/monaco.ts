/**
 * Monaco carregado localmente (sem CDN), apenas com o núcleo do editor e as linguagens usadas.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/edcore.main';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    if (label === 'json') return new JsonWorker();
    return new EditorWorker();
  },
};

const ts = monaco.languages.typescript;
const compilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  jsx: ts.JsxEmit.React,
  allowJs: true,
  allowNonTsExtensions: true,
  esModuleInterop: true,
};
// Apenas erros de sintaxe: os módulos (react-native, express) não existem no editor.
const diagnostics = { noSemanticValidation: true, noSyntaxValidation: false, noSuggestionDiagnostics: true };
ts.typescriptDefaults.setCompilerOptions(compilerOptions);
ts.javascriptDefaults.setCompilerOptions(compilerOptions);
ts.typescriptDefaults.setDiagnosticsOptions(diagnostics);
ts.javascriptDefaults.setDiagnosticsOptions(diagnostics);

monaco.editor.defineTheme('codearena', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A7199', fontStyle: 'italic' },
    { token: 'keyword', foreground: '9DABFF' },
    { token: 'string', foreground: '6FE3B4' },
    { token: 'number', foreground: 'FFC34D' },
    { token: 'type', foreground: '7FE7FF' },
    { token: 'tag', foreground: '7FE7FF' },
    { token: 'attribute.name', foreground: 'FF9C85' },
  ],
  colors: {
    'editor.background': '#111426',
    'editor.lineHighlightBackground': '#191D34',
    'editorLineNumber.foreground': '#4A5178',
    'editorLineNumber.activeForeground': '#FFC34D',
    'editorCursor.foreground': '#FFC34D',
    'editor.selectionBackground': '#2C47F066',
    'editorIndentGuide.background1': '#22263F',
    'editorGutter.background': '#111426',
    'editorWidget.background': '#191D34',
  },
});

loader.config({ monaco });

export { monaco };
