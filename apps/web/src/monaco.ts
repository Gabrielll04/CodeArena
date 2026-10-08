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
    { token: 'comment', foreground: '6B7299', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'B79BFF' },
    { token: 'string', foreground: 'C9FF7A' },
    { token: 'number', foreground: 'FFC940' },
    { token: 'type', foreground: '7FE7FF' },
    { token: 'tag', foreground: '7FE7FF' },
    { token: 'attribute.name', foreground: 'FFB3C3' },
  ],
  colors: {
    'editor.background': '#0B0D18',
    'editor.lineHighlightBackground': '#151933',
    'editorLineNumber.foreground': '#3A416F',
    'editorLineNumber.activeForeground': '#B9FF3B',
    'editorCursor.foreground': '#B9FF3B',
    'editor.selectionBackground': '#8C61FF55',
    'editorIndentGuide.background1': '#1D2242',
    'editorGutter.background': '#0B0D18',
    'editorWidget.background': '#151933',
  },
});

loader.config({ monaco });

export { monaco };
