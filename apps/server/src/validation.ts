import { evaluateChecklist, type SubmissionValidator } from '@codearena/core';
import type { PluginRegistry, QuizPlugin } from '@codearena/plugin-sdk';
import { toPublicQuestion } from '@codearena/schemas';

/** Validação oficial: a mesma checklist do cliente, executada no servidor, mais a verificação extra do plugin. */
export function createSubmissionValidator(registry: PluginRegistry<QuizPlugin<any>>): SubmissionValidator {
  return async (code, question) => {
    const plugin = registry.get(question.pluginId);
    if (!plugin) {
      return { passed: false, items: [], message: `O plugin "${question.pluginId}" não está instalado no servidor` };
    }
    const publicQuestion = toPublicQuestion(question);
    const result = await evaluateChecklist(code, publicQuestion, { plugin });
    const items = result.items.map((item) => ({
      id: item.id,
      passed: item.status === 'done',
      ...(item.message ? { message: item.message } : {}),
    }));
    if (!result.allRequiredDone) {
      const missing = result.requiredTotal - result.requiredDone;
      return {
        passed: false,
        items,
        message: `${missing} ${missing === 1 ? 'item não foi confirmado' : 'itens não foram confirmados'} pelo servidor`,
      };
    }
    if (plugin.validateSubmission) {
      const extra = await plugin.validateSubmission(code, publicQuestion);
      if (!extra.valid) return { passed: false, items, message: extra.message ?? 'Recusado pela verificação do plugin' };
    }
    return { passed: true, items };
  };
}
