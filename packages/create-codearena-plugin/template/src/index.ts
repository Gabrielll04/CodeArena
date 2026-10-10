/**
 * Definição do plugin, igual no navegador e no servidor: validadores da checklist e código inicial.
 * O servidor usa este arquivo para a validação oficial (campo "codearena" do package.json).
 */
import { z } from 'zod';
import { definePlugin, escapeRegExp, type QuizPlugin } from '@codearena/plugin-sdk';

export const PLUGIN_ID = '{{id}}';

export const plugin = definePlugin<QuizPlugin>({
  id: PLUGIN_ID,
  displayName: '{{name}}',
  description: 'Descreva em uma frase o que este plugin avalia.',
  version: '0.1.0',
  // Linguagem do editor Monaco (ex.: "python", "html", "sql", "plaintext").
  editorLanguage: 'plaintext',
  editorFileName: 'resposta.txt',
  getStarterCode: (question) => question.starterCode,
  validators: {
    // Exemplo de validador estático: troque pela regra da sua disciplina.
    hasLineStartingWith: {
      description: 'Existe uma linha que começa com o texto indicado.',
      mode: 'static',
      params: z.object({ prefix: z.string().min(1), count: z.number().int().min(1).default(1) }),
      exampleParams: { prefix: 'R = ', count: 1 },
      validate: ({ code, params }) => {
        const found = code.match(new RegExp(`^\\s*${escapeRegExp(params.prefix)}`, 'gm'))?.length ?? 0;
        if (found >= params.count) return true;
        return { passed: false, message: `Esperado ${params.count} linha(s) com "${params.prefix}", encontrado ${found}` };
      },
    },
  },
  authoring: {
    defaultStarterCode: '',
  },
});

export default plugin;
