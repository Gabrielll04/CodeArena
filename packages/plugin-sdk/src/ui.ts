import type { ReactNode } from 'react';
import type { PublicQuestion } from '@codearena/schemas';
import type { ChecklistEvaluationResult, QuizPlugin } from './types';

/** Dados que o app entrega à interface do plugin. Plugins não recebem o estado interno do app. */
export interface PluginUIContext {
  question: PublicQuestion;
  /** Código atual do editor (já com debounce aplicado pelo app). */
  code: string;
  readOnly: boolean;
  evaluation: ChecklistEvaluationResult | null;
  /** play: aluno numa sala; authoring: editor do professor; preview: pré-visualização como aluno. */
  mode: 'play' | 'authoring' | 'preview';
}

/** Plugin com interface para o navegador. */
export interface ClientQuizPlugin<S = unknown> extends QuizPlugin<S> {
  /** Título da aba/painel do plugin (ex.: "Preview", "Cliente HTTP"). */
  previewTitle?: string;
  sidePanelTitle?: string;
  /** Painel principal à direita do editor (ex.: moldura de celular). */
  renderPreview?(context: PluginUIContext): ReactNode;
  /** Painel de ferramentas (ex.: cliente HTTP). */
  renderSidePanel?(context: PluginUIContext): ReactNode;
}
