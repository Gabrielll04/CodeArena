import type { ZodType, ZodTypeDef } from 'zod';
import type { ChecklistItem, PublicQuestion } from '@codearena/schemas';

export type MaybePromise<T> = T | Promise<T>;

/**
 * Estados de um item da checklist.
 * - pending: ainda não satisfeito (sem punição visual).
 * - running: regra dinâmica em execução.
 * - done: satisfeito.
 * - failed: regra dinâmica executou e falhou (com mensagem), ou a regra está mal configurada.
 */
export type ChecklistItemStatus = 'pending' | 'running' | 'done' | 'failed';

export interface ChecklistItemResult {
  id: string;
  status: ChecklistItemStatus;
  optional: boolean;
  message?: string;
}

export interface ChecklistEvaluationResult {
  items: ChecklistItemResult[];
  requiredTotal: number;
  requiredDone: number;
  allRequiredDone: boolean;
}

/**
 * static: depende só do texto do código (regex, AST). Rápido; roda a cada tecla com debounce curto.
 * dynamic: executa o código (runner, requisições HTTP). Roda com debounce maior e pode ser assíncrono.
 */
export type ValidatorMode = 'static' | 'dynamic';

export interface ValidatorContext<P, S> {
  code: string;
  question: PublicQuestion;
  item: ChecklistItem;
  params: P;
  /** Sessão criada por `createSession` do plugin (ex.: AST já parseada, runtime em execução). */
  session: S;
  signal?: AbortSignal;
}

export type ValidatorOutcome = boolean | { passed: boolean; message?: string };

export interface ChecklistValidator<P = any, S = any> {
  /** Descrição curta exibida no editor de questões e na documentação. */
  description: string;
  mode: ValidatorMode;
  /** Schema dos parâmetros. Parâmetros inválidos marcam o item como "failed" com a mensagem do Zod. */
  params?: ZodType<P, ZodTypeDef, unknown>;
  /** Exemplo de params usado pelo editor manual ao escolher o validador. */
  exampleParams?: Record<string, unknown>;
  validate(ctx: ValidatorContext<P, S>): MaybePromise<ValidatorOutcome>;
}

export interface SessionInput {
  code: string;
  question: PublicQuestion;
  /** Modos que serão avaliados nesta rodada; permite pular trabalho caro (ex.: não iniciar runner). */
  modes: ReadonlySet<ValidatorMode>;
  signal?: AbortSignal;
}

export interface SubmissionCheck {
  valid: boolean;
  message?: string;
}

/** Ajuda para o professor montar regex comuns no editor manual. */
export interface RegexHelper {
  id: string;
  label: string;
  /** Rótulo do campo de entrada; se ausente, o helper não pede entrada. */
  inputLabel?: string;
  defaultInput?: string;
  build(input: string): { pattern: string; flags?: string; label: string };
}

export interface PluginAuthoring {
  regexHelpers?: RegexHelper[];
  /** Código inicial sugerido para novas questões. */
  defaultStarterCode?: string;
  /** Link ou caminho da documentação do plugin. */
  docsPath?: string;
}

/**
 * Definição de plugin independente de ambiente (navegador e servidor).
 * A parte visual fica em `ClientQuizPlugin` (`@codearena/plugin-sdk/ui`).
 */
export interface QuizPlugin<S = unknown> {
  /** Identificador usado em `pack.pluginId` / `question.pluginId`. */
  id: string;
  displayName: string;
  description: string;
  version: string;
  /** Linguagem do Monaco: "javascript", "typescript", "python"... */
  editorLanguage: string;
  /** Nome do arquivo do modelo do editor (ex.: "App.tsx"); ajuda o Monaco a habilitar JSX. */
  editorFileName?: string;

  getStarterCode(question: PublicQuestion): string;

  /** Validadores usados por regras `{ "type": "pluginRule", "validator": "<nome>" }`. */
  validators?: Record<string, ChecklistValidator<any, S>>;

  /** Cria estado compartilhado por todos os validadores numa rodada de avaliação. */
  createSession?(input: SessionInput): MaybePromise<S>;
  disposeSession?(session: S): MaybePromise<void>;

  /**
   * Verificação extra executada só no servidor, depois da checklist,
   * antes de aceitar uma resposta. Use para regras que não cabem em itens.
   */
  validateSubmission?(code: string, question: PublicQuestion): Promise<SubmissionCheck>;

  authoring?: PluginAuthoring;
}

/**
 * Export default da entrada "." ou "server" de um pacote de plugin (ver manifesto `codearena` no package.json):
 * o próprio plugin ou uma função que o cria.
 */
export type PluginEntry<P extends QuizPlugin<any> = QuizPlugin<any>> = P | (() => MaybePromise<P>);
