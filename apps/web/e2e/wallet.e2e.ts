import { expect, test } from '@playwright/test';
import { apiUser, cop, loginInUi, navTo, registerInUi } from './helpers';

test.describe('Billetera', () => {
  test('anonymous users are sent to the login page', async ({ page }) => {
    await page.goto('/movimientos');
    await expect(page).toHaveURL(/\/ingresar\?returnUrl=%2Fmovimientos$/);
    await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
  });

  test('wrong credentials show the API error in Spanish', async ({ page, request }) => {
    const { email } = await apiUser(request, 'Carla Ruiz');
    await loginInUi(page, email, 'Wrong-passw0rd');
    await expect(page.getByTestId('problem')).toHaveText('Correo o contraseña incorrectos.');
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('register → deposit → transfer → history → reload → logout', async ({ page, request }) => {
    const luis = await apiUser(request, 'Luis Alberto Pérez');

    await registerInUi(page, 'Ana María Gómez');
    await expect(page.getByRole('heading', { name: /Hola, Ana/ })).toBeVisible();
    await expect(page.getByTestId('balance')).toHaveText(cop('0'));
    await expect(page.getByTestId('empty-state')).toBeVisible();

    // Deposit (sandbox money).
    await navTo(page, 'Depositar');
    await page.getByRole('button', { name: /100\.000/ }).click();
    await page.getByRole('button', { name: 'Depositar', exact: true }).click();
    await expect(page.getByTestId('deposit-success')).toContainText('¡Depósito exitoso!');
    await expect(page.getByTestId('deposit-success')).toContainText(cop('100.000'));

    // Transfer with recipient lookup and confirmation.
    await navTo(page, 'Transferir');
    await page
      .getByLabel('Número de cuenta', { exact: true })
      .fill(luis.wallet.number.replace(/-/g, ''));
    await page.getByRole('button', { name: 'Buscar destinatario' }).click();
    await expect(page.getByTestId('recipient')).toContainText('Luis A***');
    await page.getByLabel('Monto (COP)').fill('25.000');
    await page.getByLabel('Mensaje (opcional)').fill('Almuerzo');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByTestId('confirm-amount')).toHaveText(cop('25.000'));
    await page.getByRole('button', { name: 'Confirmar y enviar' }).click();
    await expect(page.getByTestId('transfer-success')).toContainText('¡Transferencia exitosa!');
    await expect(page.getByTestId('transfer-success')).toContainText(cop('75.000'));

    // History with a filter.
    await page.getByRole('link', { name: 'Ver movimientos' }).click();
    const rows = page.getByTestId('transaction');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Enviaste a Luis A***');
    await expect(rows.first()).toContainText('Almuerzo');
    await page.getByLabel('Dirección').selectOption('IN');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Depósito de prueba');

    // The access token lives in memory only: a reload restores it from the refresh cookie.
    await page.reload();
    await expect(page).toHaveURL(/\/movimientos$/);
    await expect(page.getByTestId('transaction')).toHaveCount(2);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/ingresar\?returnUrl=%2Finicio$/);
  });

  test('a lost response is retried with the same Idempotency-Key and charged once', async ({
    page,
    request,
  }) => {
    const ana = await apiUser(request, 'Ana Gómez', 10_000_000);
    const luis = await apiUser(request, 'Luis Pérez');
    await loginInUi(page, ana.email);
    await expect(page.getByTestId('balance')).toHaveText(cop('100.000'));

    // First attempt reaches the API (money moves) but the response is "lost".
    const keys: string[] = [];
    await page.route('**/api/v1/transfers', async (route) => {
      keys.push((await route.request().headerValue('idempotency-key')) ?? '');
      if (keys.length === 1) {
        await route.fetch();
        await route.abort('connectionreset');
      } else {
        await route.continue();
      }
    });

    await navTo(page, 'Transferir');
    await page.getByLabel('Número de cuenta', { exact: true }).fill(luis.wallet.number);
    await page.getByRole('button', { name: 'Buscar destinatario' }).click();
    await page.getByLabel('Monto (COP)').fill('30.000');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Confirmar y enviar' }).click();

    await expect(page.getByTestId('problem')).toContainText('No pudimos conectar');
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('transfer-success')).toContainText(cop('70.000'));

    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);

    // Charged exactly once.
    await navTo(page, 'Inicio');
    await expect(page.getByTestId('balance')).toHaveText(cop('70.000'));
  });
});
