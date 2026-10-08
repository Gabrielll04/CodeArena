/**
 * Plugins disponíveis no navegador.
 * Para adicionar um plugin: registre aqui a versão de interface (ClientQuizPlugin)
 * e em apps/server/src/plugins.ts a versão de servidor. Nenhuma outra parte do app precisa mudar.
 */
import { PluginRegistry } from '@codearena/plugin-sdk';
import type { ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import { createReactNativeClientPlugin } from '@codearena/plugin-react-native/ui';
import { createBackendHttpClientPlugin } from '@codearena/plugin-backend-http/ui';

export const clientPlugins = new PluginRegistry<ClientQuizPlugin<any>>([
  createReactNativeClientPlugin({ sandboxUrl: '/sandbox.html?plugin=react-native' }),
  createBackendHttpClientPlugin(),
]);
