/**
 * Prints e vídeo do mapa de capacidades e da recuperação, com uma turma fictícia (e2e/fixtures/capability-sessions.mjs).
 *
 * Uso: pnpm build && pnpm media:capacidades (o vídeo precisa do ffmpeg instalado)
 * Saída: docs/images/22..25-*.png, docs/images/capacidades-demo.gif e docs/public/videos/capacidades-demo.mp4
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { importCapabilitySessions } from '../e2e/fixtures/capability-sessions.mjs';

const root = resolve(import.meta.dirname, '..');
const IMAGES = join(root, 'docs/images');
const VIDEOS = join(root, 'docs/public/videos');
const PORT = 3400;
const BASE = `http://localhost:${PORT}`;
const KEY = 'chave-dos-prints-do-mapa-de-capacidades';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataDir = await mkdtemp(join(tmpdir(), 'codearena-capacidades-'));
const videoDir = await mkdtemp(join(tmpdir(), 'codearena-capacidades-rec-'));
const server = spawn(join(root, 'node_modules/.bin/tsx'), ['apps/server/src/index.ts', '--production'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), CODEARENA_DATA_DIR: dataDir, CODEARENA_LOG: 'silent' },
  stdio: 'inherit',
});
for (let i = 0; i < 60; i++) {
  if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break;
  await sleep(500);
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
try {
  await importCapabilitySessions(BASE, KEY);

  /* Prints, em 2x para ficarem nítidos no README. */
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await context.addInitScript((key) => localStorage.setItem('codearena:teacher-key', JSON.stringify(key)), KEY);
  const page = await context.newPage();
  const shot = async (name, target = page) => {
    await sleep(700);
    await target.screenshot({ path: join(IMAGES, `${name}.png`) });
    console.log('ok', name);
  };

  await page.goto(`${BASE}/teacher/capacidades`);
  await page.getByTestId('capability-bars').waitFor();
  await shot('22-capacidades-visao-geral');
  await shot('23-capacidades-por-capacidade', page.getByTestId('capability-bars'));

  await page.getByTestId('capability-matrix').scrollIntoViewIfNeeded();
  await page.getByTestId('matrix-row-João Pires').getByRole('button', { name: /^João Pires, Parâmetros de rota:/ }).hover();
  await shot('24-capacidades-por-aluno');

  await page.getByTestId('select-student-João Pires').check();
  await page.getByTestId('select-student-Davi Rocha').check();
  await page.getByTestId('open-recovery').click();
  await page.getByRole('dialog', { name: 'Criar recuperação' }).waitFor();
  await shot('25-capacidades-recuperacao');
  await context.close();

  /* Vídeo: do histórico até a sala de recuperação aberta. */
  const recording = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  });
  await recording.addInitScript((key) => localStorage.setItem('codearena:teacher-key', JSON.stringify(key)), KEY);
  const video = await recording.newPage();
  const slow = async (locator, action = 'click') => {
    await locator.scrollIntoViewIfNeeded();
    await locator.hover();
    await sleep(600);
    await locator[action]();
    await sleep(1200);
  };
  await video.goto(`${BASE}/teacher/historico`);
  await sleep(1500);
  await slow(video.getByTestId('open-capabilities'));
  await video.getByTestId('capability-bars').waitFor();
  await sleep(1500);
  await video.getByTestId('capability-bars').locator('li').first().locator('span[aria-hidden]').last().hover();
  await sleep(1800);
  await slow(video.getByTestId('capability-bars').getByRole('button', { name: /Parâmetros de rota/ }));
  await video.mouse.wheel(0, 650);
  await sleep(1200);
  await video.getByTestId('matrix-row-João Pires').getByRole('button', { name: /^João Pires, Parâmetros de rota:/ }).hover();
  await sleep(2200);
  await video.getByTestId('matrix-row-Davi Rocha').getByRole('button', { name: /^Davi Rocha, Parâmetros de rota:/ }).hover();
  await sleep(2200);
  await slow(video.getByTestId('capability-bars').getByRole('button', { name: /Parâmetros de rota/ }));
  await slow(video.getByTestId('select-student-João Pires'), 'check');
  await slow(video.getByTestId('open-recovery'));
  await sleep(1500);
  await slow(video.getByTestId('create-recovery'));
  await video.getByRole('dialog', { name: /Abrir sala/ }).waitFor();
  await sleep(2500);
  await recording.close();

  const [webm] = (await readdir(videoDir)).filter((f) => f.endsWith('.webm'));
  const ff = (args) => {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`ffmpeg falhou: ${args.join(' ')}`);
  };
  const mp4 = join(VIDEOS, 'capacidades-demo.mp4');
  ff(['-i', join(videoDir, webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-movflags', '+faststart', mp4]);
  ff(['-ss', '1', '-i', mp4, '-frames:v', '1', '-q:v', '4', join(VIDEOS, 'capacidades-demo-poster.jpg')]);
  ff([
    '-i',
    mp4,
    '-vf',
    'fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    join(IMAGES, 'capacidades-demo.gif'),
  ]);
  console.log('ok vídeo, poster e gif');
} finally {
  await browser.close();
  server.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
  await rm(videoDir, { recursive: true, force: true });
}
