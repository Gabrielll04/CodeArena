import type { PluginEntry, QuizPlugin } from '@codearena/plugin-sdk';
import { createBackendHttpPlugin, type BackendSessionState } from '../index';
import { createChildProcessExecutor, type ChildProcessExecutorOptions } from './childProcessExecutor';

export { createChildProcessExecutor, permissionFlags } from './childProcessExecutor';

/** Plugin backend-http para o servidor: validação oficial em processo Node isolado. */
export function createBackendHttpServerPlugin(options: ChildProcessExecutorOptions = {}): QuizPlugin<BackendSessionState> {
  return createBackendHttpPlugin({ executor: createChildProcessExecutor(options) });
}

/** Entrada "server" do manifesto. */
const entry: PluginEntry<QuizPlugin<BackendSessionState>> = () => createBackendHttpServerPlugin();
export default entry;
