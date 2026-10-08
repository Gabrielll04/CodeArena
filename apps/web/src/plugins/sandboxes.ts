/** Runtimes executados dentro do iframe isolado, por id de plugin (carregados sob demanda). */
export const sandboxRuntimes: Record<string, () => Promise<(root: HTMLElement) => void>> = {
  'react-native': () => import('@codearena/plugin-react-native/sandbox').then((m) => m.mountReactNativeSandbox),
};
