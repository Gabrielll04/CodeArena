import { escapeRegExp, type RegexHelper } from '@codearena/plugin-sdk';

/** Ajudas de regex independentes de plugin; cada plugin acrescenta as suas em `authoring.regexHelpers`. */
export const GENERIC_REGEX_HELPERS: RegexHelper[] = [
  {
    id: 'imports-module',
    label: 'Importa módulo',
    inputLabel: 'Módulo',
    defaultInput: 'express',
    build: (name) => ({
      pattern: `require\\(\\s*["']${escapeRegExp(name)}["']\\s*\\)|from\\s+["']${escapeRegExp(name)}["']`,
      label: `Importar o módulo ${name}`,
    }),
  },
  {
    id: 'async-function',
    label: 'Usa função assíncrona',
    build: () => ({
      pattern: `\\basync\\s+(function\\b|\\(|[A-Za-z_$][\\w$]*\\s*=>)`,
      label: 'Usar uma função assíncrona (async)',
    }),
  },
  {
    id: 'declares-function',
    label: 'Declara função',
    inputLabel: 'Nome da função',
    defaultInput: 'somar',
    build: (name) => ({
      pattern: `function\\s+${escapeRegExp(name)}\\s*\\(|(const|let)\\s+${escapeRegExp(name)}\\s*=\\s*(async\\s*)?(\\([^)]*\\)|[A-Za-z_$][\\w$]*)\\s*=>`,
      label: `Declarar a função ${name}`,
    }),
  },
];
