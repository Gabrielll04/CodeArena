import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateChecklist, pendingChecklist, summarize } from '@codearena/core';
import type { ChecklistEvaluationResult, ChecklistItemResult, QuizPlugin } from '@codearena/plugin-sdk';
import type { PublicQuestion } from '@codearena/schemas';

export interface LiveChecklist {
  evaluation: ChecklistEvaluationResult;
  /** true quando o resultado corresponde exatamente ao código atual, incluindo regras dinâmicas. */
  fresh: boolean;
  /** Ids de itens dinâmicos sendo reavaliados. */
  checking: Set<string>;
  /** Código ao qual `evaluation` se refere quando `fresh`. */
  evaluatedCode: string | null;
}

function hasDynamicItems(question: PublicQuestion, plugin?: QuizPlugin<any>): boolean {
  return question.checklist.some(
    (item) => item.rule.type === 'pluginRule' && plugin?.validators?.[item.rule.validator]?.mode === 'dynamic',
  );
}

/**
 * Avalia a checklist em duas fases:
 *  1. regras estáticas (texto/AST) com debounce curto: feedback quase imediato;
 *  2. regras dinâmicas (execução) com debounce maior, mantendo o último resultado visível enquanto roda.
 */
export function useChecklist(
  code: string,
  question: PublicQuestion,
  plugin: QuizPlugin<any> | undefined,
  options: { staticDelayMs?: number; dynamicDelayMs?: number; enabled?: boolean } = {},
): LiveChecklist {
  const { staticDelayMs = 120, dynamicDelayMs = 700, enabled = true } = options;
  const dynamic = useMemo(() => hasDynamicItems(question, plugin), [question, plugin]);
  const [state, setState] = useState<LiveChecklist>(() => ({
    evaluation: pendingChecklist(question.checklist),
    fresh: false,
    checking: new Set(),
    evaluatedCode: null,
  }));
  const lastDynamic = useRef<Map<string, ChecklistItemResult>>(new Map());
  const seq = useRef(0);

  useEffect(() => {
    lastDynamic.current = new Map();
    setState({ evaluation: pendingChecklist(question.checklist), fresh: false, checking: new Set(), evaluatedCode: null });
  }, [question]);

  useEffect(() => {
    if (!enabled) return;
    const id = ++seq.current;
    const controller = new AbortController();

    const staticTimer = setTimeout(async () => {
      const result = await evaluateChecklist(code, question, { plugin, modes: ['static'] });
      if (seq.current !== id) return;
      if (!dynamic) {
        setState({ evaluation: result, fresh: true, checking: new Set(), evaluatedCode: code });
        return;
      }
      // Itens dinâmicos: mantém o último resultado conhecido, sinalizando que está sendo verificado.
      const checking = new Set<string>();
      const items = result.items.map((item) => {
        if (item.status !== 'running') return item;
        checking.add(item.id);
        return lastDynamic.current.get(item.id) ?? { ...item, status: 'pending' as const };
      });
      setState({ evaluation: summarize(items), fresh: false, checking, evaluatedCode: null });
    }, staticDelayMs);

    const dynamicTimer = dynamic
      ? setTimeout(async () => {
          const result = await evaluateChecklist(code, question, { plugin, signal: controller.signal });
          if (seq.current !== id || controller.signal.aborted) return;
          result.items.forEach((item) => {
            const original = question.checklist.find((i) => i.id === item.id);
            if (original?.rule.type === 'pluginRule' && plugin?.validators?.[original.rule.validator]?.mode === 'dynamic') {
              lastDynamic.current.set(item.id, item);
            }
          });
          setState({ evaluation: result, fresh: true, checking: new Set(), evaluatedCode: code });
        }, dynamicDelayMs)
      : null;

    return () => {
      clearTimeout(staticTimer);
      if (dynamicTimer) clearTimeout(dynamicTimer);
      controller.abort();
    };
  }, [code, question, plugin, dynamic, enabled, staticDelayMs, dynamicDelayMs]);

  return state;
}
