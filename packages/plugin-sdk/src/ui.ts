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

/**
 * Contexto do editor de resposta de um plugin visual. `code` é a resposta atual (o documento do plugin).
 * O editor é controlado: mostra sempre `code` e avisa mudanças por `onChange`, que fica ausente em modo
 * somente leitura (resposta travada, solução esperada, comparação).
 */
export interface PluginEditorContext extends PluginUIContext {
  /**
   * Troca a resposta inteira. Chame em mudanças concluídas (soltar um aparelho, ligar um cabo, confirmar um campo),
   * não a cada movimento do mouse: cada chamada reavalia a checklist.
   */
  onChange?: (code: string) => void;
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
  /**
   * Editor de resposta próprio, no lugar do editor de código (ex.: área de montar topologias ou circuitos).
   * Usado pelo aluno, no editor do professor (estado inicial, solução e teste) e para mostrar respostas.
   * Ocupa a área central inteira; tem de caber em qualquer tamanho e funcionar com teclado.
   */
  renderEditor?(context: PluginEditorContext): ReactNode;
}

/** Opções que o app entrega à entrada "ui" de um plugin. */
export interface ClientPluginOptions {
  /** URL da página isolada de preview já apontando para este plugin (só para plugins com entrada "sandbox"). */
  sandboxUrl: string;
}

/** Export default da entrada "ui": o plugin ou uma função que o cria a partir das opções do app. */
export type ClientPluginEntry<S = any> =
  | ClientQuizPlugin<S>
  | ((options: ClientPluginOptions) => ClientQuizPlugin<S> | Promise<ClientQuizPlugin<S>>);

/** Export default da entrada "sandbox": monta o runtime de preview dentro do iframe isolado. */
export type SandboxEntry = (root: HTMLElement) => void | Promise<void>;
