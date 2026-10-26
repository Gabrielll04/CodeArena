import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, pasteIntoEditor, setEditorCode } from './helpers';

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

test('plugin no modo isolado: painel em iframe sem acesso ao app e validação oficial em processo restrito', async ({ page: host, browser }) => {
  const code = await createRoom(host, 'pack-exemplo-isolado-teste');
  const ana = await joinRoom(browser, code, 'Ana');
  // Uma segunda aluna mantém a rodada aberta depois que Ana responde.
  await joinRoom(browser, code, 'Bia', 'cube');
  await host.getByTestId('start-question').click();
  await expect(ana.getByTestId('question-prompt')).toContainText('resistência');

  // O painel do plugin roda num iframe sandbox: não alcança o DOM nem o armazenamento do app.
  const panel = ana.frameLocator('[data-testid="isolated-panel-side"]');
  await expect(panel.getByTestId('isolado-acesso-app')).toHaveText('Acesso ao app: bloqueado');
  await expect(panel.getByTestId('isolado-acesso-storage')).toHaveText('Armazenamento: bloqueado');
  await expect(ana.locator('[data-testid="isolated-panel-side"]')).toHaveAttribute('sandbox', 'allow-scripts');

  // Os validadores rodam no iframe de lógica do plugin; o painel recebe o código atualizado.
  await setEditorCode(ana, 'A unidade é o volt.');
  await expect(ana.getByTestId('checklist-item-unidade')).toHaveAttribute('data-status', 'pending');
  await expect(panel.getByTestId('isolado-caracteres')).toHaveText('Caracteres: 19');

  // Resposta completa: o servidor valida de novo, com o plugin num processo Node restrito.
  await setEditorCode(ana, 'A unidade é o ohm.');
  await expect(ana.getByTestId('checklist-item-unidade')).toHaveAttribute('data-status', 'done');
  await expect(ana.getByTestId('answer-accepted')).toBeVisible();
  await expect(host.getByTestId('host-answered')).toHaveText('1');
});

test('sala sem colar: o editor recusa a colagem, avisa o aluno e o professor vê a tentativa', async ({ page: host, browser }) => {
  const code = await createRoom(host, 'pack-exemplo-react-native-fundamentos');
  await host.getByRole('button', { name: 'Configurações' }).click();
  const settings = host.getByRole('dialog');
  await settings.getByText('Permitir colar texto').click();
  await expect(settings.getByRole('switch', { name: /Permitir colar texto/ })).not.toBeChecked();
  await host.keyboard.press('Escape');

  const ana = await joinRoom(browser, code, 'Ana');
  await joinRoom(browser, code, 'Bia', 'cube');
  await host.getByTestId('start-question').click();
  await expect(ana.getByTestId('question-prompt')).toContainText('Clique aqui');
  await expect(ana.getByTestId('paste-disabled')).toBeVisible();

  await pasteIntoEditor(ana, SOLUTION);
  await expect(ana.getByTestId('paste-notice')).toHaveText('Colar está desativado nesta sala.');
  // Nada entrou no editor: o item que a colagem concluiria continua pendente.
  await ana.waitForTimeout(500);
  await expect(ana.getByTestId('checklist-item-componente-app')).toHaveAttribute('data-status', 'pending');
  await expect(host.getByTestId('host-progress')).toContainText('Tentou colar 1x');

  // Digitar continua funcionando normalmente.
  await setEditorCode(ana, SOLUTION);
  await expect(ana.getByTestId('answer-accepted')).toBeVisible();
});

test('sala com colar: a colagem que conclui a checklist aparece na linha do tempo do professor, sem mudar o XP', async ({ page: host, browser }) => {
  const code = await createRoom(host, 'pack-exemplo-react-native-fundamentos');
  const ana = await joinRoom(browser, code, 'Ana');
  const bia = await joinRoom(browser, code, 'Bia', 'cube');
  await host.getByTestId('start-question').click();
  await expect(ana.getByTestId('question-prompt')).toContainText('Clique aqui');

  await pasteIntoEditor(ana, SOLUTION);
  await expect(ana.getByTestId('paste-notice')).toHaveText('O professor vê quando você cola código.');
  await expect(ana.getByTestId('answer-accepted')).toBeVisible();
  await expect(host.getByTestId('host-progress')).toContainText('Revisar');

  // Bia digita aos poucos: sem indício.
  await setEditorCode(bia, 'export default function App() {');
  await expect(bia.getByTestId('checklist-count')).toHaveText('1/4');
  await host.getByTestId('finish-question').click();

  const panel = host.getByTestId('host-review').getByTestId('timeline-panel');
  await expect(panel.getByTestId('timeline-flagged')).toHaveText('1 aluno para revisar.');
  await expect(panel.locator('[data-testid="timeline-row"][data-player="Ana"]')).toHaveAttribute('data-flagged', 'true');
  await expect(panel.locator('[data-testid="timeline-row"][data-player="Bia"]')).toHaveAttribute('data-flagged', 'false');
  // A colagem não altera a pontuação: Ana segue em 1º com XP normal.
  await expect(host.getByTestId('leaderboard-row').first()).toHaveAttribute('data-player', 'Ana');
});

test('atividade avaliativa com projeto guiado: passos, navegação entre questões, notas e CSV', async ({ page: host, browser }) => {
  const pack = {
    pack: { title: 'Avaliação E2E', pluginId: 'react-native', version: '1.0.0' },
    questions: [
      {
        id: 'boas-vindas',
        kind: 'guided',
        title: 'Tela de boas-vindas',
        prompt: 'Crie uma tela de boas-vindas.',
        goalImage: 'https://example.com/boas-vindas.png',
        timeLimitSeconds: 300,
        baseXP: 100,
        speedBonusMax: 100,
        solution: "import { View, Text } from 'react-native';\n\nexport default function App() {\n  return <View><Text>Bem-vindo</Text></View>;\n}",
        checklist: [
          { id: 'app', label: 'Criar o componente App', hint: 'Comece com export default function App().', rule: { type: 'contains', value: 'export default function App' } },
          { id: 'view', label: 'Usar uma View', hint: 'Devolva uma View no return.', rule: { type: 'contains', value: '<View' }, weight: 2 },
          { id: 'texto', label: 'Mostrar "Bem-vindo"', hint: 'Coloque um Text com Bem-vindo dentro da View.', rule: { type: 'contains', value: 'Bem-vindo' } },
        ],
      },
      {
        id: 'botao',
        prompt: 'Faça um app com um Button escrito "Enviar".',
        timeLimitSeconds: 300,
        baseXP: 100,
        speedBonusMax: 100,
        solution: 'export default function App() { return <Button title="Enviar" />; }',
        checklist: [{ id: 'button', label: 'Usar Button com "Enviar"', rule: { type: 'regex', pattern: '<Button[^>]*Enviar' } }],
      },
    ],
  };
  const created = await host.request.post('/api/packs', { data: pack });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  await host.goto('/teacher');
  await host.getByTestId(`pack-${id}`).getByTestId('open-room').click();
  await host.getByText('Atividade avaliativa', { exact: true }).click();
  await host.getByTestId('assessment-minutes').fill('20');
  await host.getByTestId('create-room').click();
  const code = (await host.getByTestId('host-room-code').textContent())!.trim();

  const ana = await joinRoom(browser, code, 'Ana', 'hex');
  const bia = await joinRoom(browser, code, 'Bia', 'cube');
  await expect(ana.getByTestId('assessment-lobby')).toContainText('20 minutos');
  await expect(ana.getByTestId('my-xp')).toHaveCount(0);
  await host.getByTestId('start-question').click();

  // Projeto guiado: passos numerados, com a instrução do passo atual e a imagem do resultado.
  await expect(ana.getByTestId('goal-image')).toBeVisible();
  await expect(ana.getByTestId('checklist-item-app')).toHaveAttribute('data-current', 'true');
  await expect(ana.getByTestId('step-hint')).toHaveText('Comece com export default function App().');
  await setEditorCode(ana, 'export default function App() {');
  await expect(ana.getByTestId('checklist-item-view')).toHaveAttribute('data-current', 'true');
  // O progresso é salvo sozinho e o professor vê o que o servidor confirmou.
  await expect(host.getByTestId('assessment-row-Ana')).toContainText('1/3');
  await expect(ana.getByTestId('question-nav').getByRole('button', { name: 'Questão 1, em andamento' })).toBeVisible();

  // Cada aluno no seu ritmo: Ana vai para a questão 2 enquanto Bia continua na 1.
  await ana.getByTestId('question-nav').getByRole('button', { name: /Questão 2/ }).click();
  await expect(ana.getByTestId('question-prompt')).toContainText('Enviar');
  await expect(bia.getByTestId('question-prompt')).toContainText('boas-vindas');
  await setEditorCode(ana, 'export default function App() { return <Button title="Enviar" />; }');
  await expect(ana.getByTestId('answer-accepted')).toContainText('Questão concluída');

  // Volta para a questão 1 com o rascunho guardado e termina.
  await ana.getByRole('button', { name: 'Ir para a questão 1' }).click();
  await expect(ana.getByTestId('checklist-item-app')).toHaveAttribute('data-status', 'done');
  await setEditorCode(ana, "import { View, Text } from 'react-native';\n\nexport default function App() {\n  return <View><Text>Bem-vindo</Text></View>;\n}");
  await expect(ana.getByTestId('answer-accepted')).toContainText('todas as questões');
  await expect(host.getByTestId('host-answered')).toHaveText('1');

  await host.getByTestId('end-assessment').click();
  await host.getByTestId('confirm-end-assessment').click();
  await expect(host.getByTestId('grades-table')).toContainText('Ana');
  await expect(host.getByTestId('final-grade')).toHaveText(['10,0', '0,0']);
  const [download] = await Promise.all([host.waitForEvent('download'), host.getByTestId('download-grades').click()]);
  const csv = await new Promise<string>((resolve, reject) => {
    void download.createReadStream().then((stream) => {
      let text = '';
      stream.on('data', (chunk) => (text += chunk));
      stream.on('end', () => resolve(text));
      stream.on('error', reject);
    });
  });
  expect(csv).toContain('aluno;q1;q2;nota');
  expect(csv).toContain('"Ana";10,0;10,0;10,0');

  // O aluno vê o que concluiu, sem nota e sem placar.
  await expect(ana.getByTestId('session-ended')).toContainText('2 de 2 questões concluídas');
  await expect(bia.getByTestId('session-ended')).toContainText('0 de 2 questões concluídas');
  await expect(bia.getByTestId('session-ended')).not.toContainText('10,0');
});
