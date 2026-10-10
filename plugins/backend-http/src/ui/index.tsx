import type { ClientPluginEntry, ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import { createBackendHttpPlugin, type BackendSessionState } from '../index';
import { HttpClientPanel } from './HttpClientPanel';
import { createWorkerExecutor, type WorkerExecutorOptions } from './workerExecutor';

export { HttpClientPanel } from './HttpClientPanel';
export { createWorkerExecutor } from './workerExecutor';

/** Plugin backend-http para o navegador: execução em Web Worker e painel de cliente HTTP. */
export function createBackendHttpClientPlugin(options: WorkerExecutorOptions = {}): ClientQuizPlugin<BackendSessionState> {
  const executor = createWorkerExecutor(options);
  const plugin = createBackendHttpPlugin({ executor });
  return {
    ...plugin,
    sidePanelTitle: 'Cliente HTTP',
    renderSidePanel: (context) => <HttpClientPanel context={context} executor={executor} />,
  };
}

/** Entrada "ui" do manifesto. */
const entry: ClientPluginEntry<BackendSessionState> = () => createBackendHttpClientPlugin();
export default entry;
