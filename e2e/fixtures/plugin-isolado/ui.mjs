/** Painel de teste: mostra se conseguiu acessar o app (não deve conseguir no modo isolado). */
import { createElement as h } from 'react';
import plugin from './index.mjs';

function tentativa(fn) {
  try {
    fn();
    return 'liberado';
  } catch {
    return 'bloqueado';
  }
}

export default {
  ...plugin,
  sidePanelTitle: 'Teste isolado',
  renderSidePanel: ({ code }) =>
    h(
      'div',
      { className: 'p-4 text-sm text-white/80' },
      h('p', { 'data-testid': 'isolado-acesso-app' }, `Acesso ao app: ${tentativa(() => window.parent.document.title)}`),
      h('p', { 'data-testid': 'isolado-acesso-storage' }, `Armazenamento: ${tentativa(() => window.localStorage.length)}`),
      h('p', { 'data-testid': 'isolado-caracteres' }, `Caracteres: ${code.length}`),
    ),
};
