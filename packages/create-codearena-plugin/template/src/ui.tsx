/**
 * Interface do plugin no navegador: o mesmo plugin com painéis React.
 * O app só baixa este arquivo quando abre uma questão deste plugin.
 */
import type { ClientPluginEntry, ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import { plugin } from './index';

export const clientPlugin: ClientQuizPlugin = {
  ...plugin,
  sidePanelTitle: 'Resumo',
  renderSidePanel: ({ code, evaluation }) => (
    <div className="space-y-2 p-4 text-sm text-white/80">
      <p className="font-semibold">Sua resposta</p>
      <p>{code.split('\n').filter((line) => line.trim()).length} linhas preenchidas.</p>
      {evaluation && (
        <p className="text-white/50">
          {evaluation.requiredDone} de {evaluation.requiredTotal} itens obrigatórios concluídos.
        </p>
      )}
    </div>
  ),
};

const entry: ClientPluginEntry = clientPlugin;
export default entry;
