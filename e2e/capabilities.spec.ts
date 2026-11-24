import { expect, test } from '@playwright/test';
import { importCapabilitySessions } from './fixtures/capability-sessions.mjs';

const TEACHER_KEY = 'chave-do-professor-e2e-capacidades-01';

test('mapa de capacidades: situação por aluno, gráfico por capacidade e recuperação aberta como atividade', async ({ page, baseURL }) => {
  await importCapabilitySessions(baseURL!, TEACHER_KEY);
  await page.addInitScript((key) => localStorage.setItem('codearena:teacher-key', JSON.stringify(key)), TEACHER_KEY);

  await page.goto('/teacher/historico');
  await page.getByTestId('open-capabilities').click();
  await expect(page.getByRole('heading', { name: 'Capacidades da turma' })).toBeVisible();
  await expect(page.getByTestId('stat-students')).toContainText('12');
  await expect(page.getByTestId('activity-filter').getByRole('button')).toHaveCount(3);

  // A capacidade com mais alunos a recuperar vem primeiro.
  await expect(page.getByTestId('capability-bars').locator('li').first()).toContainText('Tratar erros');

  // João errou "Parâmetros de rota" também na recuperação; Davi recuperou.
  const joao = page.getByTestId('matrix-row-João Pires');
  await expect(joao.getByRole('button', { name: /Parâmetros de rota: A recuperar/ })).toBeVisible();
  await expect(page.getByTestId('matrix-row-Davi Rocha').getByRole('button', { name: /Parâmetros de rota: Recuperada/ })).toBeVisible();

  // Sem a atividade de recuperação no mapa, Davi volta a ter "Parâmetros de rota" a recuperar.
  await page.getByTestId('activity-filter').getByRole('button', { name: /Recuperação/ }).click();
  await expect(page.getByTestId('matrix-row-Davi Rocha').getByRole('button', { name: /Parâmetros de rota: A recuperar/ })).toBeVisible();
  await page.getByTestId('activity-filter').getByRole('button', { name: /Recuperação/ }).click();

  // Recuperação só para João: as capacidades dele já vêm marcadas.
  await page.getByTestId('select-student-João Pires').check();
  await expect(page.getByTestId('recovery-bar')).toContainText('1 aluno selecionado, 3 capacidades a recuperar');
  await page.getByTestId('open-recovery').click();
  const dialog = page.getByRole('dialog', { name: 'Criar recuperação' });
  await expect(dialog.getByTestId('recovery-students')).toContainText('João Pires');
  await expect(dialog.getByTestId('recovery-questions').getByRole('listitem')).toHaveCount(3);
  await dialog.getByTestId('create-recovery').click();

  // O pack novo abre direto no diálogo da sala, já no modo Atividade.
  const room = page.getByRole('dialog', { name: /Abrir sala: Recuperação/ });
  await expect(room).toBeVisible();
  await expect(room.getByRole('radio', { name: /Atividade/ })).toBeChecked();
  await expect(page).toHaveURL(/\/teacher$/);
});
