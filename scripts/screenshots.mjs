/**
 * Gera as imagens de docs/images/ percorrendo uma sessão real no navegador (Playwright).
 * Uso: pnpm build && pnpm screenshots
 * Sobe o servidor de produção numa porta própria, com dados temporários.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const OUT = join(root, 'docs/images');
const PORT = 3200;
const BASE = `http://localhost:${PORT}`;

const dataDir = await mkdtemp(join(tmpdir(), 'codearena-shots-'));
const server = spawn(join(root, 'node_modules/.bin/tsx'), ['apps/server/src/index.ts'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), CODEARENA_DATA_DIR: dataDir, CODEARENA_LOG: 'silent' },
  stdio: 'inherit',
});
for (let i = 0; i < 60; i++) {
  if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
// SHOTS_ONLY="10-,14-" regrava só as imagens cujo nome começa com algum prefixo (a sessão roda inteira do mesmo jeito).
const only = (process.env.SHOTS_ONLY ?? '').split(',').filter(Boolean);
const wanted = (name) => only.length === 0 || only.some((prefix) => name.startsWith(prefix));
const shot = async (target, name) => {
  if (!wanted(name)) return;
  await target.waitForTimeout?.(700);
  await target.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('ok', name);
};
const shotElement = async (page, testId, name) => {
  if (!wanted(name)) return;
  await page.waitForTimeout(900);
  await page.getByTestId(testId).screenshot({ path: join(OUT, `${name}.png`) });
  console.log('ok', name);
};
const open = async (viewport = { width: 1440, height: 900 }) =>
  (await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })).newPage();

// Cola o código (clipboard) em vez de digitar: o Monaco reindenta cada linha digitada e estragaria os prints.
/** Site de documentação (precisa de `pnpm docs:build`): captura a home e uma página de guia. */
async function captureSite() {
  if (!wanted('20-') && !wanted('21-')) return;
  const site = spawn(join(root, 'node_modules/.bin/vitepress'), ['preview', 'docs', '--port', '4174'], { cwd: root, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) {
      if (await fetch('http://localhost:4174/').then((r) => r.ok).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const page = await open();
    await page.goto('http://localhost:4174/');
    await shot(page, '20-site-documentacao');
    await page.goto('http://localhost:4174/agents/debug-questions');
    await shot(page, '21-site-guia');
  } finally {
    site.kill('SIGTERM');
  }
}
const siteOnly = only.length > 0 && only.every((prefix) => prefix.startsWith('20-') || prefix.startsWith('21-'));

async function setCode(page, code) {
  const editor = page.locator('.monaco-editor').first();
  await editor.waitFor();
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}

async function createRoom(host, packId, titles) {
  await host.goto(`${BASE}/teacher`);
  await host.getByTestId(`pack-${packId}`).getByTestId('open-room').click();
  await host.getByRole('button', { name: 'Desmarcar todas' }).click();
  for (const title of titles) await host.getByText(title, { exact: false }).first().click();
  await host.getByTestId('create-room').click();
  await host.getByTestId('host-room-code').waitFor();
  return (await host.getByTestId('host-room-code').textContent()).trim();
}

async function joinRoom(code, name, avatar) {
  const page = await open();
  await page.goto(`${BASE}/join?code=${code}`);
  await page.getByLabel('Seu nome').fill(name);
  await page.getByTestId(`avatar-${avatar}`).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByTestId('lobby').waitFor();
  return page;
}

try {
  if (siteOnly) {
    await captureSite();
    await browser.close();
    process.exitCode = 0;
    throw Object.assign(new Error('site-only'), { siteOnly: true });
  }
  /* ---------------- Telas gerais e do professor ---------------- */
  const teacher = await open();
  await teacher.goto(BASE);
  await shot(teacher, '01-home');
  await teacher.goto(`${BASE}/teacher`);
  await teacher.getByTestId('pack-list').waitFor();
  await shot(teacher, '02-biblioteca');

  await teacher.getByTestId('open-import').click();
  await teacher.getByTestId('import-text').fill(
    JSON.stringify(
      {
        pack: { title: 'Pack com erros', pluginId: 'react-native', version: '1.0' },
        questions: [
          {
            id: 'Questão 1',
            prompt: '',
            timeLimitSeconds: 5,
            baseXP: 500,
            speedBonusMax: 500,
            checklist: [{ id: 'a', label: 'Usar Button', rule: { type: 'regex', pattern: '<Button(' } }],
          },
        ],
      },
      null,
      2,
    ),
  );
  await shot(teacher, '03-importar-json-erros');
  await teacher.keyboard.press('Escape');

  await teacher.goto(`${BASE}/teacher/packs/new?from=exemplo-react-native-fundamentos`);
  await teacher.getByTestId('item-editor-0').waitFor();
  await teacher.waitForTimeout(2500);
  await teacher.evaluate(() => window.scrollTo(0, 0));
  await shot(teacher, '04-editor-questao');
  await teacher.getByTestId('item-editor-0').scrollIntoViewIfNeeded();
  await teacher.locator('main').evaluate((el) => (el.scrollTop = 560));
  await shot(teacher, '05-editor-checklist-e-teste');

  /* ---------------- Plugin react-native ---------------- */
  const hostRN = await open();
  const codeRN = await createRoom(hostRN, 'exemplo-react-native-fundamentos', ['Primeiro botão', 'Contador com estado']);
  const ana = await joinRoom(codeRN, 'Ana', 'hex');
  const bia = await joinRoom(codeRN, 'Bia', 'cube');
  await joinRoom(codeRN, 'Caio', 'orbit'); // fica parado: mostra "ninguém avançou" nos itens
  await shot(ana, '06-lobby-aluno');
  await shot(hostRN, '07-lobby-professor');

  await hostRN.getByTestId('start-question').click();
  await ana.getByTestId('countdown').waitFor();
  await shot(ana, '08-contagem-regressiva');
  await ana.getByTestId('checklist').waitFor({ timeout: 15000 });
  await ana.locator('.monaco-editor').first().waitFor();
  await ana.waitForTimeout(800);

  await setCode(ana, 'export default function App() {\n  return <Button');
  await ana.getByTestId('checklist-item-componente-app').and(ana.locator('[data-status=done]')).waitFor();
  await shot(ana, 'rn-01-checklist-parcial');

  await setCode(ana, 'export default function App() {\n  return <Button title="Clique aqui"\n}');
  await ana.getByTestId('rn-preview-error').waitFor({ timeout: 15000 });
  await shot(ana, 'rn-02-erro-no-preview');

  await setCode(ana, 'export default function App() {\n  return <Button title="Clique aqui" />;\n}');
  await ana.getByTestId('answer-accepted').waitFor();
  await ana.frameLocator('iframe[title="Preview React Native"]').getByText('Clique aqui').waitFor();
  await shot(ana, 'rn-03-resposta-aceita');

  // Bia usa o Button mas esquece o título; Caio não escreve nada.
  await setCode(bia, 'export default function App() {\n  return <Button />;\n}');
  await hostRN.getByTestId('insight-usar-button').and(hostRN.locator('[data-done="2"]')).waitFor({ timeout: 20000 });
  await shot(hostRN, '09-professor-acompanhando');

  await hostRN.getByTestId('finish-question').click();
  await hostRN.getByTestId('host-review').waitFor();
  await hostRN.waitForTimeout(1800);
  await shot(hostRN, '10-placar-professor');
  await shotElement(hostRN, 'stuck-panel', '14-onde-a-turma-travou');
  await shot(ana, '11-placar-aluno');

  await hostRN.getByTestId('next-question').click();
  await ana.getByRole('heading', { name: 'Contador com estado' }).waitFor();
  await ana.getByTestId('checklist').waitFor({ timeout: 15000 });
  await ana.waitForTimeout(3500);
  await setCode(
    ana,
    "import { useState } from 'react';\nimport { View, Text, Button } from 'react-native';\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n  return (\n    <View style={{ padding: 24, gap: 12 }}>\n      <Text style={{ fontSize: 40, textAlign: 'center' }}>{count}</Text>\n      <Button title=\"Somar\" onPress={() => setCount(count + 1)} />\n    </View>\n  );\n}",
  );
  await ana.getByTestId('answer-accepted').waitFor({ timeout: 20000 });
  const frame = ana.frameLocator('iframe[title="Preview React Native"]');
  await frame.getByText('SOMAR').waitFor();
  await frame.getByText('SOMAR').click();
  await frame.getByText('SOMAR').click();
  await frame.getByText('SOMAR').click();
  await shot(ana, 'rn-04-contador-com-estado');

  await hostRN.getByTestId('finish-question').click();
  await hostRN.getByTestId('host-review').waitFor();
  await hostRN.getByTestId('end-session').click();
  await hostRN.getByTestId('report-table').waitFor();
  await shot(hostRN, '12-relatorio-final');
  await shotElement(hostRN, 'session-insights', '15-revisao-da-turma');
  await shot(ana, '13-fim-de-sessao-aluno');

  /* ---------------- Questões de depuração ---------------- */
  const hostDebug = await open();
  const codeDebug = await createRoom(hostDebug, 'exemplo-depuracao-react-native', ['O botão sem texto']);
  const dana = await joinRoom(codeDebug, 'Dana', 'spark');
  await joinRoom(codeDebug, 'Edu', 'gear');
  await hostDebug.getByTestId('start-question').click();
  await dana.getByTestId('debug-bar').waitFor({ timeout: 20000 });
  await dana.frameLocator('iframe[title="Preview React Native"]').locator('body').waitFor();
  await dana.waitForTimeout(2500);
  await shot(dana, '16-depuracao-codigo-com-bug');

  await setCode(
    dana,
    "import { View, Button } from 'react-native';\n\nexport default function App() {\n  return (\n    <View>\n      <Button title=\"Salvar\">Salvar</Button>\n    </View>\n  );\n}\n",
  );
  await dana.getByTestId('checklist-count').and(dana.locator(':has-text("3/4")')).waitFor();
  await dana.getByTestId('debug-diff').click();
  await dana.getByRole('dialog').locator('.monaco-diff-editor').waitFor();
  await dana.waitForTimeout(1500);
  await shot(dana, '17-depuracao-o-que-mudei');
  await dana.keyboard.press('Escape');

  await setCode(
    dana,
    "import { View, Button } from 'react-native';\n\nexport default function App() {\n  return (\n    <View>\n      <Button title=\"Salvar\" />\n    </View>\n  );\n}\n",
  );
  await dana.getByTestId('answer-accepted').waitFor({ timeout: 20000 });
  await hostDebug.getByTestId('finish-question').click();
  await hostDebug.getByTestId('host-review').waitFor();
  await hostDebug.getByRole('button', { name: 'Mostrar solução esperada' }).click();
  await hostDebug.getByTestId('solution-diff').waitFor();
  await hostDebug.waitForTimeout(1500);
  await shot(hostDebug, '18-depuracao-correcao-esperada');

  const hostDebugBE = await open();
  const codeDebugBE = await createRoom(hostDebugBE, 'exemplo-depuracao-backend-http', ['A rota que nunca responde']);
  const gil = await joinRoom(codeDebugBE, 'Gil', 'node');
  await joinRoom(codeDebugBE, 'Hana', 'ring');
  await hostDebugBE.getByTestId('start-question').click();
  await gil.getByTestId('debug-bar').waitFor({ timeout: 20000 });
  await gil.getByTestId('checklist-item-ping-responde').and(gil.locator('[data-status=failed]')).waitFor({ timeout: 30000 });
  await gil.getByRole('button', { name: 'Enviar' }).click();
  await gil.getByTestId('http-client').getByText(/não respondeu/).waitFor({ timeout: 15000 });
  await shot(gil, '19-depuracao-backend');

  /* ---------------- Plugin backend-http ---------------- */
  const hostBE = await open();
  const codeBE = await createRoom(hostBE, 'exemplo-backend-http-basico', ['Health check', 'Parâmetro de rota']);
  const eva = await joinRoom(codeBE, 'Eva', 'bolt');
  await joinRoom(codeBE, 'Fabi', 'wave');
  await hostBE.getByTestId('start-question').click();
  await eva.getByTestId('checklist').waitFor({ timeout: 15000 });
  await eva.locator('.monaco-editor').first().waitFor();
  await eva.waitForTimeout(800);

  await setCode(eva, "const express = require('express');\nconst app = express();\n\napp.get('/health', (req, res) => {\n  res.status(503).json({ status: 'down' });\n});\n\napp.listen(3000);");
  await eva.getByTestId('checklist-item-health-responde-ok').and(eva.locator('[data-status=failed]')).waitFor({ timeout: 20000 });
  await eva.getByRole('button', { name: 'Enviar' }).click();
  await eva.getByTestId('http-status').waitFor();
  await shot(eva, 'backend-01-requisicao-falhando');

  await setCode(eva, "const express = require('express');\nconst app = express();\n\napp.get('/health', (req, res) => {\n  console.log('health chamado');\n  res.status(200).json({ status: 'ok' });\n});\n\napp.listen(3000);");
  await eva.getByTestId('answer-accepted').waitFor({ timeout: 20000 });
  await eva.getByRole('button', { name: 'Enviar' }).click();
  await eva.getByRole('tab', { name: /Console/ }).waitFor();
  await shot(eva, 'backend-02-resposta-aceita');

  await hostBE.getByTestId('finish-question').click();
  await hostBE.getByTestId('host-review').waitFor();
  await hostBE.getByTestId('next-question').click();
  await eva.getByTestId('checklist').waitFor({ timeout: 15000 });
  await eva.waitForTimeout(3500);
  await setCode(eva, "const express = require('express');\nconst app = express();\n\napp.get('/users/:id', (req, res) => {\n  res.json({ id: '42' });\n});\n\napp.listen(3000);");
  await eva.getByTestId('checklist-item-responde-7').and(eva.locator('[data-status=failed]')).waitFor({ timeout: 20000 });
  await eva.getByRole('button', { name: 'Enviar' }).click();
  await shot(eva, 'backend-03-resposta-decorada-recusada');

  await captureSite();
  await browser.close();
} catch (error) {
  if (!error?.siteOnly) throw error;
} finally {
  server.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
}
