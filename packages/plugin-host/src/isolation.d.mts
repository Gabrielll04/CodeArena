import type { QuizPlugin } from '@codearena/plugin-sdk';

export declare const ISOLATION_CHANNEL: 'codearena-plugin';

/** Metadados serializáveis de um plugin isolado. */
export interface IsolatedPluginDescription {
  id: string;
  displayName: string;
  description: string;
  version: string;
  editorLanguage: string;
  editorFileName?: string;
  validators: Record<string, { description: string; mode: 'static' | 'dynamic'; exampleParams?: Record<string, unknown> }>;
  hasSession: boolean;
  hasSubmissionCheck: boolean;
  authoring?: { defaultStarterCode?: string; docsPath?: string };
}

export type IsolatedCall = (method: string, params?: Record<string, unknown>) => Promise<any>;

export declare function describePlugin(plugin: QuizPlugin<any>): IsolatedPluginDescription;

/** Responde às chamadas do app dentro do contexto isolado. */
export declare function createPluginHandler(plugin: QuizPlugin<any>): IsolatedCall;

/** QuizPlugin que encaminha cada chamada ao contexto isolado. */
export declare function createPluginProxy(description: IsolatedPluginDescription, call: IsolatedCall): QuizPlugin<any> & { isolated: true };
