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
  const anaXP = Number((await ana.getByTestId('my-xp').textContent())!.replace(/\D/g, ''));
  expect(anaXP).toBeGreaterThan(1500);

  await host.getByTestId('end-session').click();
  await expect(host.getByTestId('report-table')).toContainText('Ana');
  await expect(host.getByTestId('report-table')).toContainText('2/2');
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
