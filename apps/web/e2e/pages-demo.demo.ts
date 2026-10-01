import { expect, type Page, test } from '@playwright/test';
import { cop, navTo } from './helpers';

// Paths are relative to the base URL (…/digital-wallet-ledger/), as on GitHub Pages.
const at = (path: string) => new RegExp(`/digital-wallet-ledger/${path}$`);

async function loginAsAna(page: Page) {
  await page.goto('ingresar');
  const hint = page.getByTestId('demo-hint');
  await expect(hint).toContainText('Demo1234');
  await hint
    .getByRole('listitem')
    .filter({ hasText: 'Ana María Gómez' })
    .getByRole('button', { name: 'Usar' })
    .click();
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(at('inicio'));
}

test.describe('Demo en GitHub Pages', () => {
  test('anonymous visitors land on login with the demo banner and hint', async ({ page }) => {
    await page.goto('./');
    await expect(page).toHaveURL(/\/digital-wallet-ledger\/ingresar\?returnUrl=%2Finicio$/);
    await expect(page.getByTestId('demo-banner')).toContainText('Modo demo · datos simulados');
    await expect(page.getByTestId('demo-hint')).toContainText('ana@billetera.demo');

    await page.getByLabel('Correo electrónico').fill('ana@billetera.demo');
    await page.getByLabel('Contraseña').fill('Wrong-pass1');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByTestId('problem')).toHaveText('Correo o contraseña incorrectos.');
  });

  test('demo user: deposit → transfer → history → deep link → reset', async ({ page }) => {
    await loginAsAna(page);
    await expect(page.getByRole('heading', { name: /Hola, Ana/ })).toBeVisible();
    await expect(page.getByTestId('balance')).toHaveText(cop('1.385.000'));
    await expect(page.getByTestId('demo-banner')).toBeVisible();

    await navTo(page, 'Depositar');
    await page
      .getByRole('button', { name: /50\.000/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Depositar', exact: true }).click();
    await expect(page.getByTestId('deposit-success')).toContainText(cop('1.435.000'));

    await navTo(page, 'Transferir');
    await page.getByRole('button', { name: 'Llave (alias)' }).click();
    await page.getByLabel('Llave', { exact: true }).fill('luis');
    await page.getByRole('button', { name: 'Buscar destinatario' }).click();
    await expect(page.getByTestId('recipient')).toContainText('Luis A***');
    await page.getByLabel('Monto (COP)').fill('25.000');
    await page.getByLabel('Mensaje (opcional)').fill('Prueba en Pages');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Confirmar y enviar' }).click();
    await expect(page.getByTestId('transfer-success')).toContainText(cop('1.410.000'));

    // History: 13 seeded movements + 2 new ones, 10 per page.
    await page.getByRole('link', { name: 'Ver movimientos' }).click();
    const rows = page.getByTestId('transaction');
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText('Enviaste a Luis A***');
    await expect(rows.first()).toContainText('Prueba en Pages');
    await page.getByRole('button', { name: 'Cargar más' }).click();
    await expect(rows).toHaveCount(15);
    await page.getByLabel('Dirección').selectOption('IN');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(rows).toHaveCount(8);

    // Deep link + reload: Pages serves 404.html, the app boots and restores the session.
    await page.reload();
    await expect(page).toHaveURL(at('movimientos'));
    await expect(rows.first()).toBeVisible();
    await page.goto('transferir');
    await expect(page).toHaveURL(at('transferir'));
    await expect(page.getByRole('heading', { name: 'Transferir', level: 1 })).toBeVisible();

    // Reset: sample data is back.
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Restablecer demo' }).click();
    await expect(page).toHaveURL(/\/digital-wallet-ledger\/ingresar\?demo=restablecida$/);
    await expect(page.getByText('la demo volvió a sus datos iniciales')).toBeVisible();
    await loginAsAna(page);
    await expect(page.getByTestId('balance')).toHaveText(cop('1.385.000'));
  });

  test('new users can register and start at $ 0', async ({ page }) => {
    await page.goto('registro');
    await page.getByLabel('Nombre completo').fill('Carla Ruiz');
    await page.getByLabel('Correo electrónico').fill(`carla.${Date.now()}@billetera.demo`);
    await page.getByLabel('Contraseña').fill('Carla-pass1');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(at('inicio'));
    await expect(page.getByTestId('balance')).toHaveText(cop('0'));
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });
});
