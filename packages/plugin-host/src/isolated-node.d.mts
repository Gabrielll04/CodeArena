import type { QuizPlugin } from '@codearena/plugin-sdk';

export interface IsolatedPluginProcess {
  /** QuizPlugin que encaminha as chamadas ao processo isolado. */
  plugin: QuizPlugin<any> & { isolated: true };
  /** Encerra o processo. */
  dispose(): void;
}

/** Inicia o plugin num processo Node filho com permissões restritas. `entry` precisa ser JavaScript. */
export declare function startIsolatedPlugin(options: {
  entry: string;
  /** Pastas que o processo pode ler (o pacote do plugin e os node_modules das dependências dele). */
  readPaths: string[];
  memoryLimitMb?: number;
  callTimeoutMs?: number;
  startTimeoutMs?: number;
  log?: (message: string) => void;
}): Promise<IsolatedPluginProcess>;
