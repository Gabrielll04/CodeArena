/**
 * Grava um vídeo curto de uma aula completa: professor, duas alunas (e uma terceira parada) numa sessão real.
 * Cada perspectiva é gravada pelo Playwright e as quatro telas (narração, professor, Ana, Bia) são montadas
 * numa grade 2x2 com o ffmpeg do sistema.
 *
 * Uso: pnpm build && pnpm demo:video
 * Saída: docs/public/videos/aula-demo.mp4, aula-demo-poster.jpg e docs/images/aula-demo.gif
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const OUT_DIR = join(root, 'docs/public/videos');
const PORT = 3300;
const BASE = `http://localhost:${PORT}`;
const W = 1280;
const H = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataDir = await mkdtemp(join(tmpdir(), 'codearena-demo-'));
const videoDir = await mkdtemp(join(tmpdir(), 'codearena-demo-rec-'));
const server = spawn(join(root, 'node_modules/.bin/tsx'), ['apps/server/src/index.ts'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), CODEARENA_DATA_DIR: dataDir, CODEARENA_LOG: 'silent' },
  stdio: 'inherit',
});
for (let i = 0; i < 60; i++) {
  if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break;
  await sleep(500);
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const createdAt = {};

async function recorded(name) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: join(videoDir, name), size: { width: W, height: H } },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  createdAt[name] = Date.now();
  return page;
}

/** Etiqueta no canto da tela para identificar quem é quem no vídeo montado. */
async function label(page, text, tone = '#B9FF3B') {
  await page.evaluate(
    ([text, tone]) => {
      document.getElementById('__label')?.remove();
      const el = document.createElement('div');
      el.id = '__label';
      el.textContent = text;
      el.style.cssText = `position:fixed;left:16px;bottom:16px;z-index:99999;padding:6px 16px;border-radius:999px;background:${tone};color:#06070D;font:700 22px 'Space Grotesk Variable',system-ui,sans-serif;letter-spacing:.02em;box-shadow:0 8px 24px -8px rgba(0,0,0,.7)`;
      document.body.appendChild(el);
    },
    [text, tone],
  );
}

/** Painel de narração no estilo do jogo (mesmos tokens do app). */
async function setupNarration(page) {
  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="narr"></div>';
    const style = document.createElement('style');
    style.textContent = `
      body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Space Grotesk Variable',system-ui,sans-serif;
        background-image:radial-gradient(1200px 600px at 10% -10%,rgba(140,97,255,.28),transparent 60%),radial-gradient(900px 500px at 110% 10%,rgba(185,255,59,.12),transparent 60%),linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);
        background-size:auto,auto,32px 32px,32px 32px;background-color:#0B0D18}
      #narr{width:1060px}
      .brand{display:flex;align-items:center;gap:14px;font-weight:700;font-size:30px;margin-bottom:64px}
      .brand span b{color:#B9FF3B}
      .step{font-family:'JetBrains Mono Variable',ui-monospace,monospace;color:#B9FF3B;font-size:24px;letter-spacing:.22em;text-transform:uppercase}
      h1{font-size:76px;line-height:1.04;margin:20px 0 24px;letter-spacing:-.025em;font-weight:700}
      p{font-size:32px;line-height:1.38;color:rgba(255,255,255,.64);margin:0;max-width:960px}
      .dots{display:flex;gap:10px;margin-top:64px}
      .dot{height:8px;flex:1;border-radius:99px;background:rgba(255,255,255,.1);transition:background .3s}
      .dot.on{background:#B9FF3B}
      .card{animation:in .35s ease-out}
      @keyframes in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
    `;
    document.head.appendChild(style);
    window.narrate = (index, total, title, text) => {
      const dots = Array.from({ length: total }, (_, i) => `<div class="dot ${i <= index ? 'on' : ''}"></div>`).join('');
      document.getElementById('narr').innerHTML = `
        <div class="brand"><svg viewBox="0 0 64 64" width="56" height="56"><rect width="64" height="64" rx="16" fill="#151933"/><path d="M24 20 12 32l12 12" fill="none" stroke="#B9FF3B" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="m40 20 12 12-12 12" fill="none" stroke="#8C61FF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="32" r="4" fill="#fff"/></svg><span>Code<b>Arena</b></span></div>
        <div class="card"><div class="step">${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div><h1>${title}</h1><p>${text}</p></div>
        <div class="dots">${dots}</div>`;
    };
  });
  await page.evaluate(() => document.fonts.ready);
}

const SCENES = [
  ['Uma aula de React Native', 'Um professor, duas alunas e uma checklist que se marca sozinha.'],
  ['O professor abre a sala', 'Escolhe a questão e recebe um código de 6 dígitos para projetar.'],
  ['Os alunos entram', 'Código, nome e avatar. Sem cadastro.'],
  ['Todos começam juntos', 'A questão chega ao mesmo tempo para todos, com contagem regressiva.'],
  ['A checklist se marca sozinha', 'Cada passo é uma regra verificável. O professor vê quantos alunos concluíram cada item, sem ver o código.'],
  ['O servidor valida e dá o XP', 'Correto e rápido vale mais. A resposta só vale depois da validação do servidor.'],
  ['Onde a turma travou', 'Ao encerrar, o professor vê qual item mais travou e quanto tempo cada passo levou.'],
  ['Placar e relatório', 'XP acumulado, acertos por questão e exportação para planilha.'],
];
const narrate = (page, i) => page.evaluate(([i, total, title, text]) => window.narrate(i, total, title, text), [i, SCENES.length, ...SCENES[i]]);

async function paste(page, code) {
  const editor = page.locator('.monaco-editor').first();
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}

/** Versões do componente, cada uma sintaticamente válida: a checklist avança passo a passo. */
const imports = "import { useState } from 'react';\nimport { View, Text, Button } from 'react-native';\n\n";
const withBody = (hook, children) =>
  `${imports}export default function App() {\n${hook}  return (\n    <View style={{ padding: 24, gap: 12 }}>\n${children}    </View>\n  );\n}\n`;
const STEPS = [
  withBody('  const [count, setCount] = useState(0);\n\n', ''),
  withBody('  const [count, setCount] = useState(0);\n\n', "      <Text style={{ fontSize: 48, textAlign: 'center' }}>{count}</Text>\n"),
  withBody('  const [count, setCount] = useState(0);\n\n', "      <Text style={{ fontSize: 48, textAlign: 'center' }}>{count}</Text>\n      <Button title=\"Somar\" />\n"),
  withBody(
    '  const [count, setCount] = useState(0);\n\n',
    "      <Text style={{ fontSize: 48, textAlign: 'center' }}>{count}</Text>\n      <Button title=\"Somar\" onPress={() => setCount(count + 1)} />\n",
  ),
];

try {
  const narr = await recorded('narr');
  const host = await recorded('host');
  const ana = await recorded('ana');
  const bia = await recorded('bia');
  await setupNarration(narr);
  await narrate(narr, 0);
  await host.goto(`${BASE}/teacher`);
  await host.getByTestId('pack-list').waitFor();
  await label(host, 'Professor', '#8C61FF');
  await sleep(3500);

  /* 1. O professor abre a sala */
  await narrate(narr, 1);
  await host.getByTestId('pack-exemplo-react-native-fundamentos').getByTestId('open-room').click();
  await sleep(1200);
  await host.getByRole('button', { name: 'Desmarcar todas' }).click();
  await sleep(500);
  await host.getByText('Contador com estado').first().click();
  await sleep(1400);
  await host.getByTestId('create-room').click();
  await host.getByTestId('host-room-code').waitFor();
  await label(host, 'Professor', '#8C61FF');
  const code = (await host.getByTestId('host-room-code').textContent()).trim();
  await sleep(2500);

  /* 2. Os alunos entram */
  await narrate(narr, 2);
  async function enter(page, name, avatar, labelTone) {
    await page.goto(`${BASE}/join?code=${code}`);
    await sleep(900);
    await page.getByLabel('Seu nome').pressSequentially(name, { delay: 120 });
    await page.getByTestId(`avatar-${avatar}`).click();
    await sleep(600);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByTestId('lobby').waitFor();
    await label(page, name, labelTone);
  }
  await enter(ana, 'Ana', 'hex', '#B9FF3B');
  await sleep(500);
  await enter(bia, 'Bia', 'cube', '#3DDCFF');
  // Caio entra sem aparecer no vídeo e fica parado: é quem "trava" na revisão.
  const caioContext = await browser.newContext({ viewport: { width: W, height: H } });
  const caio = await caioContext.newPage();
  await caio.goto(`${BASE}/join?code=${code}`);
  await caio.getByLabel('Seu nome').fill('Caio');
  await caio.getByRole('button', { name: 'Entrar', exact: true }).click();
  await caio.getByTestId('lobby').waitFor();
  await sleep(2500);

  /* 3. Todos começam juntos */
  await narrate(narr, 3);
  await sleep(800);
  await host.getByTestId('start-question').click();
  await ana.getByTestId('checklist').waitFor({ timeout: 20000 });
  await ana.locator('.monaco-editor').first().waitFor();
  await bia.locator('.monaco-editor').first().waitFor();
  await sleep(2500);

  /* 4. A checklist se marca sozinha */
  await narrate(narr, 4);
  await paste(ana, STEPS[0]);
  await sleep(2200);
  await paste(bia, STEPS[0]);
  await sleep(1800);
  await paste(ana, STEPS[1]);
  await sleep(2200);
  await paste(bia, STEPS[1]);
  await sleep(1800);
  await paste(ana, STEPS[2]);
  await sleep(2600);
  await paste(bia, STEPS[2]);
  await sleep(2200);

  /* 5. O servidor valida e dá o XP */
  await narrate(narr, 5);
  await paste(ana, STEPS[3]);
  await ana.getByTestId('answer-accepted').waitFor({ timeout: 20000 });
  await sleep(1800);
  const anaPreview = ana.frameLocator('iframe[title="Preview React Native"]');
  for (let i = 0; i < 3; i++) {
    await anaPreview.getByText('SOMAR').click();
    await sleep(500);
  }
  await sleep(1200);
  await paste(bia, STEPS[3]);
  await bia.getByTestId('answer-accepted').waitFor({ timeout: 20000 });
  await sleep(2600);

  /* 6. Onde a turma travou */
  await narrate(narr, 6);
  await host.getByTestId('finish-question').click();
  await host.getByTestId('host-review').waitFor();
  await sleep(2600);
  await host.getByTestId('stuck-panel').scrollIntoViewIfNeeded();
  await sleep(4200);

  /* 7. Placar e relatório */
  await narrate(narr, 7);
  await host.getByTestId('end-session').click();
  await host.getByTestId('report-table').waitFor();
  await sleep(3000);
  await host.getByTestId('session-insights').scrollIntoViewIfNeeded();
  await sleep(4200);

  await caioContext.close();
  const pages = { narr, host, ana, bia };
  const paths = {};
  for (const [name, page] of Object.entries(pages)) {
    const video = page.video();
    await page.context().close();
    paths[name] = await video.path();
  }
  await browser.close();

  /* ---------------- Montagem ---------------- */
  await mkdir(OUT_DIR, { recursive: true });
  const T0 = Math.max(...Object.values(createdAt));
  const order = ['narr', 'host', 'ana', 'bia'];
  const TW = 800;
  const TH = 500;
  const filters = order
    .map((name, i) => `[${i}:v]trim=start=${((T0 - createdAt[name]) / 1000).toFixed(3)},setpts=PTS-STARTPTS,fps=20,scale=${TW}:${TH}:flags=lanczos[v${i}]`)
    .join(';');
  const stack = `${order.map((_, i) => `[v${i}]`).join('')}xstack=inputs=4:layout=0_0|${TW}_0|0_${TH}|${TW}_${TH}:shortest=1[out]`;
  const mp4 = join(OUT_DIR, 'aula-demo.mp4');
  const ff = (args) => {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`ffmpeg falhou: ${args.join(' ')}`);
  };
  ff([...order.flatMap((n) => ['-i', paths[n]]), '-filter_complex', `${filters};${stack}`, '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
  console.log('ok', mp4);

  // Pôster (quadro com a checklist em andamento) e GIF de pré-visualização para o README.
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', mp4], { encoding: 'utf8' });
  const duration = Number(probe.stdout.trim());
  console.log('duração', duration.toFixed(1), 's');
  ff(['-ss', String(Math.round(duration * 0.5)), '-i', mp4, '-frames:v', '1', '-q:v', '3', join(OUT_DIR, 'aula-demo-poster.jpg')]);
  const gifStart = Math.round(duration * 0.38);
  ff(['-ss', String(gifStart), '-t', '14', '-i', mp4, '-vf', 'fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', join(root, 'docs/images/aula-demo.gif')]);
  console.log('ok poster e gif');
} finally {
  server.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
  await rm(videoDir, { recursive: true, force: true });
}
