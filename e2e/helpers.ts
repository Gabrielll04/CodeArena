import { expect, type Browser, type Page } from '@playwright/test';

/** Substitui todo o conteúdo do editor Monaco, como um aluno colando código. */
export async function setEditorCode(page: Page, code: string) {
  const editor = page.locator('.monaco-editor').first();
  await editor.waitFor();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(code);
  // O Monaco fecha chaves automaticamente; remove o que sobrar depois do cursor.
  await page.keyboard.press('ControlOrMeta+Shift+End');
  await page.keyboard.press('Delete');
}

export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

export async function createRoom(host: Page, packTestId: string): Promise<string> {
  await host.goto('/teacher');
  await host.getByTestId(packTestId).getByTestId('open-room').click();
  await host.getByTestId('create-room').click();
  const code = host.getByTestId('host-room-code');
  await expect(code).toHaveText(/^\d{6}$/);
  return (await code.textContent())!.trim();
}

export async function joinRoom(browser: Browser, code: string, name: string, avatar = 'bolt'): Promise<Page> {
  const page = await newPage(browser);
  await page.goto(`/join?code=${code}`);
  await page.getByLabel('Seu nome').fill(name);
  await page.getByTestId(`avatar-${avatar}`).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  return page;
}
