import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, setEditorCode } from './helpers';

const SOLUTION = 'export default function App() {\n  return <Button title="Clique aqui" />;\n}';

test('sessão ao vivo com React Native: checklist automática, validação no servidor e placar', async ({ page: host, browser }) => {
  const code = await createRoom(host, 'pack-exemplo-react-native-fundamentos');

  const ana = await joinRoom(browser, code, 'Ana', 'hex');
  const bia = await joinRoom(browser, code, 'Bia', 'cube');
  await expect(host.getByTestId('host-player-count')).toHaveText('2');
  await expect(ana.getByTestId('lobby')).toContainText('Bia');

  await host.getByTestId('start-question').click();
  // Todos recebem a contagem regressiva e depois a mesma questão.
  await expect(ana.getByTestId('countdown')).toBeVisible();
  await expect(bia.getByTestId('countdown')).toBeVisible();
  await expect(ana.getByTestId('question-prompt')).toContainText('Clique aqui');
  await expect(bia.getByTestId('question-prompt')).toContainText('Clique aqui');

  // Escrever export default function App() marca imediatamente o primeiro item.
  await setEditorCode(ana, 'export default function App() {');
  await expect(ana.getByTestId('checklist-item-componente-app')).toHaveAttribute('data-status', 'done');
  await expect(ana.getByTestId('checklist-item-usar-button')).toHaveAttribute('data-status', 'pending');
  await expect(ana.getByTestId('checklist-count')).toHaveText('1/4');
  // O professor vê o progresso (contagem), não o código.
  await expect(host.getByTestId('host-progress')).toContainText('1/4');
  // Revisão ao vivo por item: 1 de 2 alunos concluiu "Criar o componente App"; ninguém concluiu o botão ainda.
  await expect(host.getByTestId('insight-componente-app')).toHaveAttribute('data-done', '1');
  await expect(host.getByTestId('insight-componente-app')).toHaveAttribute('data-total', '2');
  await expect(host.getByTestId('insight-usar-button')).toHaveAttribute('data-done', '0');

  // Checklist completa: envio automático, validação no servidor e editor travado.
  await setEditorCode(ana, SOLUTION);
  await expect(ana.getByTestId('answer-accepted')).toBeVisible();
  await expect(ana.getByTestId('accepted-overlay')).toContainText('XP');
  await expect(ana.getByText('Somente leitura')).toBeVisible();
  await expect(host.getByTestId('host-answered')).toHaveText('1');

  // O preview renderiza o botão dentro do iframe isolado.
  const preview = ana.frameLocator('iframe[title="Preview React Native"]');
  await expect(preview.getByText('Clique aqui')).toBeVisible();

  // Bia responde depois: todos concluíram, a questão termina e o placar aparece.
  await setEditorCode(bia, SOLUTION);
  await expect(host.getByTestId('host-review')).toBeVisible();
  const rows = host.getByTestId('leaderboard-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-player', 'Ana');
  await expect(ana.getByTestId('review')).toContainText('1º lugar');
  await expect(bia.getByTestId('review')).toContainText('2º lugar');
  await expect(host.getByTestId('stuck-summary')).toHaveText('Todos os alunos concluíram todos os itens.');

  // Segunda questão: só Ana responde; o professor encerra manualmente. O XP acumula.
  await host.getByTestId('next-question').click();
  await expect(ana.getByTestId('question-prompt')).toContainText('Olá, CodeArena');
  await setEditorCode(
    ana,
    "import { View, Text } from 'react-native';\n\nexport default function App() {\n  return (\n    <View>\n      <Text>Olá, CodeArena</Text>\n    </View>\n  );\n}",
  );
  await expect(ana.getByTestId('answer-accepted')).toBeVisible();
  await host.getByTestId('finish-question').click();
  await expect(host.getByTestId('host-review')).toBeVisible();
  await expect(ana.getByTestId('review')).toBeVisible();
  // Bia não avançou: a revisão aponta o item mais difícil (1 de 2 concluíram).
  await expect(host.getByTestId('stuck-summary')).toContainText('Item mais difícil');
  await expect(host.getByTestId('stuck-summary')).toContainText('1 de 2 concluíram');
  await expect(host.getByTestId('stuck-panel').getByText('Mais travou')).toBeVisible();
  const anaXP = Number((await ana.getByTestId('my-xp').textContent())!.replace(/\D/g, ''));
  expect(anaXP).toBeGreaterThan(1500);

  await host.getByTestId('end-session').click();
  await expect(host.getByTestId('report-table')).toContainText('Ana');
  await expect(host.getByTestId('report-table')).toContainText('2/2');
  await expect(host.getByTestId('session-insights')).toContainText('Onde a turma travou');
  await expect(host.getByTestId('session-hardest').locator('li')).not.toHaveCount(0);
  await expect(bia.getByTestId('session-ended')).toBeVisible();
});

test('aluno recupera o estado ao recarregar a página', async ({ page: host, browser }) => {
  const code = await createRoom(host, 'pack-exemplo-react-native-fundamentos');
  const caio = await joinRoom(browser, code, 'Caio');
  await joinRoom(browser, code, 'Duda');
  await host.getByTestId('start-question').click();
  await setEditorCode(caio, SOLUTION);
  await expect(caio.getByTestId('answer-accepted')).toBeVisible();
  await caio.reload();
  await expect(caio.getByTestId('answer-accepted')).toBeVisible();
  await expect(host.getByTestId('host-answered')).toHaveText('1');
});

test('questão de backend: cliente HTTP executa o código e a checklist valida o comportamento', async ({ page: host, browser }) => {
  const code = await createRoom(host, 'pack-exemplo-backend-http-basico');
  const eva = await joinRoom(browser, code, 'Eva');
  await joinRoom(browser, code, 'Fabi');
  await host.getByTestId('start-question').click();

  await setEditorCode(
    eva,
    "const express = require('express');\nconst app = express();\napp.get('/health', (req, res) => res.status(503).json({ status: 'down' }));\napp.listen(3000);",
  );
  await expect(eva.getByTestId('checklist-item-health-responde-ok')).toHaveAttribute('data-status', 'failed');
  await expect(eva.getByTestId('checklist-item-health-responde-ok')).toContainText('Esperado status 200, recebido 503');

  await eva.getByRole('button', { name: 'Enviar' }).click();
  await expect(eva.getByTestId('http-status')).toHaveText('503');
  await expect(eva.getByTestId('http-body')).toContainText('"down"');

  await setEditorCode(
    eva,
    "const express = require('express');\nconst app = express();\napp.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));\napp.listen(3000);",
  );
  await expect(eva.getByTestId('answer-accepted')).toBeVisible();
});

test('professor importa um pack JSON e vê erros de validação antes', async ({ page }) => {
  await page.goto('/teacher');
  await page.getByTestId('open-import').click();
  await page.getByTestId('import-text').fill('{ "pack": { "title": "Incompleto" }, "questions": [] }');
  await expect(page.getByTestId('issue-list')).toContainText('pack.pluginId');
  await expect(page.getByTestId('confirm-import')).toBeDisabled();

  const pack = {
    pack: { title: 'Pack importado E2E', description: '', pluginId: 'react-native', version: '1.0.0', tags: ['e2e'] },
    questions: [
      {
        id: 'texto',
        prompt: 'Mostre um Text com "Oi".',
        timeLimitSeconds: 60,
        baseXP: 100,
        speedBonusMax: 100,
        solution: 'export default function App() { return <Text>Oi</Text>; }',
        checklist: [{ id: 'text', label: 'Usar Text', rule: { type: 'contains', value: '<Text' } }],
      },
    ],
  };
  await page.getByTestId('import-text').fill(JSON.stringify(pack));
  await expect(page.getByTestId('import-valid')).toContainText('Pack importado E2E');
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('pack-list')).toContainText('Pack importado E2E');
});

test('abrir sala mostra o diálogo já completo, sem etapa de carregamento', async ({ page }) => {
  // API lenta: antes o diálogo abria só com um spinner e depois mudava de tamanho.
  await page.route('**/api/packs/*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.goto('/teacher');
  await page.getByTestId('pack-exemplo-react-native-fundamentos').getByTestId('open-room').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.getByRole('checkbox').count()).toBeGreaterThanOrEqual(5);
});

test('configurações da sala abrem centralizadas sobre a tela inteira', async ({ page }) => {
  await createRoom(page, 'pack-exemplo-react-native-fundamentos');
  await page.getByRole('button', { name: 'Configurações' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  // Centralizado na janela (antes ficava preso dentro da barra superior).
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(60);
  expect(box.height).toBeGreaterThan(150);
  await dialog.getByText('Modo discreto').click();
  await expect(page.getByRole('switch').first()).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('questão de depuração: código com bug, diferenças, restaurar e correção esperada', async ({ page: host, browser }) => {
  const code = await createRoom(host, 'pack-exemplo-depuracao-react-native');
  const ana = await joinRoom(browser, code, 'Ana');
  await joinRoom(browser, code, 'Bia');
  await host.getByTestId('start-question').click();

  // Código com bug: os itens de comportamento começam pendentes e os de "não quebrar" já passam.
  await expect(ana.getByTestId('debug-bar')).toBeVisible();
  await expect(ana.getByTestId('question-prompt')).toContainText('Depuração');
  await expect(ana.getByTestId('checklist-count')).toHaveText('2/4');
  await expect(ana.getByTestId('checklist-item-botao-salvar')).toHaveAttribute('data-status', 'pending');
  await expect(ana.getByTestId('checklist-item-mantem-view')).toHaveAttribute('data-status', 'done');
  await expect(ana.getByTestId('debug-diff')).toBeDisabled();
  await expect(host.getByText('Depuração').first()).toBeVisible();

  // Correção parcial: ainda sobra o </Button>. "Ver o que mudei" mostra o diff.
  const partial =
    "import { View, Button } from 'react-native';\n\nexport default function App() {\n  return (\n    <View>\n      <Button title=\"Salvar\">Salvar</Button>\n    </View>\n  );\n}\n";
  await setEditorCode(ana, partial);
  await expect(ana.getByTestId('checklist-count')).toHaveText('3/4');
  await ana.getByTestId('debug-diff').click();
  const dialog = ana.getByRole('dialog');
  await expect(dialog.locator('.monaco-diff-editor')).toBeVisible();
  await expect(dialog).toContainText('Seu código');
  await ana.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Restaurar volta ao código com bug (com confirmação).
  await ana.getByTestId('debug-restore').click();
  await ana.getByTestId('debug-restore-confirm').click();
  await expect(ana.getByTestId('checklist-count')).toHaveText('2/4');
  await expect(ana.getByTestId('debug-diff')).toBeDisabled();

  // Correção completa: aceita pelo servidor.
  await setEditorCode(
    ana,
    "import { View, Button } from 'react-native';\n\nexport default function App() {\n  return (\n    <View>\n      <Button title=\"Salvar\" />\n    </View>\n  );\n}\n",
  );
  await expect(ana.getByTestId('answer-accepted')).toBeVisible();

  // Ao fim, a correção esperada aparece como diff para a turma e para o professor.
  await host.getByTestId('finish-question').click();
  await expect(host.getByTestId('host-review')).toBeVisible();
  await host.getByRole('button', { name: 'Mostrar solução esperada' }).click();
  await expect(host.getByTestId('solution-diff')).toBeVisible();
  await ana.getByRole('button', { name: 'Ver a correção esperada' }).click();
  await expect(ana.getByTestId('solution-diff')).toBeVisible();
});

test('editor manual cria questão de depuração e avisa quando o bug não é detectado', async ({ page }) => {
  await page.goto('/teacher/packs/new');
  await page.getByTestId('kind-debug').click();
  await page.getByLabel('Enunciado').fill('O botão não mostra o texto.');
  // O item padrão (regex vazia) é satisfeito por qualquer código: a checklist não consegue detectar o bug.
  await expect(page.getByTestId('authoring-warnings')).toContainText('a checklist não detecta o bug');
  await page.getByTestId('kind-build').click();
  await expect(page.getByTestId('authoring-warnings')).toContainText('O código inicial já completa a checklist');
});

test('preview React Native volta a renderizar quando o iframe recarrega sozinho', async ({ page: host, browser }) => {
  const code = await createRoom(host, 'pack-exemplo-react-native-fundamentos');
  const ana = await joinRoom(browser, code, 'Ana');
  await host.getByTestId('start-question').click();
  await setEditorCode(ana, 'export default function App() {\n  return <Text>OIII TESTE</Text>;\n}');
  const preview = ana.frameLocator('iframe[title="Preview React Native"]');
  await expect(preview.getByText('OIII TESTE')).toBeVisible();

  // Simula o recarregamento do sandbox (ex.: Vite reotimizando dependências em desenvolvimento).
  const sandbox = ana.frames().find((frame) => frame.url().includes('sandbox.html'))!;
  await sandbox.evaluate(() => location.reload());
  // Sem digitar nada, o app reenvia o código quando o iframe avisa que está pronto.
  await expect(preview.getByText('OIII TESTE')).toBeVisible();
});
