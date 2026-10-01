import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { apiUser, cop, loginInUi, navTo } from './helpers';

/**
 * Not a test: captures the README screenshots with realistic data.
 * Runs only when SCREENSHOTS_DIR is set, e.g.
 *   SCREENSHOTS_DIR=../../docs/screenshots pnpm --filter web e2e screenshots
 */
const dir = process.env['SCREENSHOTS_DIR'];
test.skip(!dir, 'Set SCREENSHOTS_DIR to capture screenshots');

async function apiTransfer(
  request: APIRequestContext,
  from: { accessToken: string; wallet: { id: string } },
  toAccountNumber: string,
  amountMinor: number,
  description: string,
) {
  const res = await request.post('/api/v1/transfers', {
    headers: {
      Authorization: `Bearer ${from.accessToken}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { fromAccountId: from.wallet.id, toAccountNumber, amountMinor, description },
  });
  expect(res.ok()).toBeTruthy();
}

async function apiDeposit(
  request: APIRequestContext,
  user: { accessToken: string; wallet: { id: string } },
  amountMinor: number,
) {
  const res = await request.post('/api/v1/deposits', {
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { accountId: user.wallet.id, amountMinor },
  });
  expect(res.ok()).toBeTruthy();
}

test('capture screens', async ({ page, request }, info) => {
  test.setTimeout(60_000);
  const shot = (page: Page, name: string) =>
    page.screenshot({
      path: `${dir}/${info.project.name}-${name}.png`,
      // The mobile tab bar is position: fixed, so phones get viewport shots.
      fullPage: !info.project.use.isMobile,
      animations: 'disabled',
    });

  // Data: Ana receives and sends money to/from Luis and Valentina.
  const ana = await apiUser(request, 'Ana María Gómez');
  const luis = await apiUser(request, 'Luis Alberto Pérez', 80_000_000);
  const valentina = await apiUser(request, 'Valentina Rojas', 50_000_000);
  await apiDeposit(request, ana, 90_000_000);
  await apiTransfer(request, ana, luis.wallet.number, 8_500_000, 'Arriendo compartido');
  await apiTransfer(request, luis, ana.wallet.number, 4_250_000, 'Almuerzo del viernes');
  await apiTransfer(request, valentina, ana.wallet.number, 12_000_000, 'Mercado');
  await apiTransfer(request, ana, valentina.wallet.number, 3_500_000, 'Taxi aeropuerto');
  await apiDeposit(request, ana, 5_000_000);

  await page.goto('/ingresar');
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
  await shot(page, '01-login');

  await page.goto('/registro');
  await expect(page.getByRole('heading', { name: 'Crear cuenta', level: 1 })).toBeVisible();
  await shot(page, '02-register');

  await loginInUi(page, ana.email);
  await expect(page.getByTestId('balance')).toHaveText(cop('992.500'));
  await expect(page.getByTestId('transaction').first()).toBeVisible();
  await shot(page, '03-dashboard');

  await navTo(page, 'Depositar');
  await page
    .getByRole('button', { name: /50\.000/ })
    .first()
    .click();
  await shot(page, '04-deposit');
  await page.getByRole('button', { name: 'Depositar', exact: true }).click();
  await expect(page.getByTestId('deposit-success')).toBeVisible();
  await shot(page, '05-deposit-success');

  await navTo(page, 'Transferir');
  await page.getByLabel('Número de cuenta', { exact: true }).fill(luis.wallet.number);
  await page.getByRole('button', { name: 'Buscar destinatario' }).click();
  await expect(page.getByTestId('recipient')).toBeVisible();
  await page.getByLabel('Monto (COP)').fill('60.000');
  await page.getByLabel('Mensaje (opcional)').fill('Cumpleaños de mamá');
  await shot(page, '06-transfer-amount');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByTestId('confirm-amount')).toBeVisible();
  await shot(page, '07-transfer-confirm');
  await page.getByRole('button', { name: 'Confirmar y enviar' }).click();
  await expect(page.getByTestId('transfer-success')).toBeVisible();
  await shot(page, '08-transfer-success');

  await navTo(page, 'Movimientos');
  await expect(page.getByTestId('transaction').first()).toBeVisible();
  await shot(page, '09-history');
  if (info.project.use.isMobile) {
    await page.getByTestId('transaction').nth(2).scrollIntoViewIfNeeded();
    await shot(page, '10-history-list');
  }
});
