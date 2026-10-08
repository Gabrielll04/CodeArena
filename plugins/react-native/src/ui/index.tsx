import type { ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import { reactNativePlugin, type ReactNativeSession } from '../index';
import { ReactNativePreview } from './ReactNativePreview';

export { ReactNativePreview } from './ReactNativePreview';

export interface ReactNativeClientOptions {
  /** URL da página isolada que carrega `@codearena/plugin-react-native/sandbox`. */
  sandboxUrl: string;
}

export function createReactNativeClientPlugin(options: ReactNativeClientOptions): ClientQuizPlugin<ReactNativeSession> {
  return {
    ...reactNativePlugin,
    previewTitle: 'Preview',
    renderPreview: (context) => <ReactNativePreview code={context.code} sandboxUrl={options.sandboxUrl} />,
  };
}
