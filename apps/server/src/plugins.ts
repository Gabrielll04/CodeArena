/**
 * Plugins disponíveis no servidor (validação oficial).
 * Para adicionar um plugin: importe a versão de servidor e registre aqui
 * (e a versão de interface em apps/web/src/plugins/registry.tsx).
 */
import { PluginRegistry, type QuizPlugin } from '@codearena/plugin-sdk';
import { reactNativePlugin } from '@codearena/plugin-react-native';
import { createBackendHttpServerPlugin } from '@codearena/plugin-backend-http/server';

export function createServerPluginRegistry(): PluginRegistry<QuizPlugin<any>> {
  return new PluginRegistry<QuizPlugin<any>>([reactNativePlugin, createBackendHttpServerPlugin()]);
}
