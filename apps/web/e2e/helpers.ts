import { type APIRequestContext, expect, type Page } from '@playwright/test';

export const PASSWORD = 'Playwright-pass1';

export const uniqueEmail = (prefix: string) =>
  `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Matches a COP amount regardless of the (non-breaking) space after "$". */
export const cop = (pesos: string) => new RegExp(`\\$\\s?${pesos.replace(/\./g, '\\.')}`);

/** Creates a user straight through the API and returns its wallet. */
export async function apiUser(request: APIRequestContext, fullName: string, depositMinor = 0) {
  const email = uniqueEmail('api');
  const reg = await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, fullName },
  });
  expect(reg.ok()).toBeTruthy();
  const { accessToken } = (await reg.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [wallet] = (await (await request.get('/api/v1/accounts', { headers })).json()) as {
    id: string;
    number: string;
  }[];
  if (depositMinor > 0) {
    const dep = await request.post('/api/v1/deposits', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { accountId: wallet.id, amountMinor: depositMinor },
    });
    expect(dep.ok()).toBeTruthy();
  }
  return { email, accessToken, wallet };
}

export async function registerInUi(page: Page, fullName: string, email = uniqueEmail('ui')) {
  await page.goto('/registro');
  await page.getByLabel('Nombre completo').fill(fullName);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  return email;
}

export async function loginInUi(page: Page, email: string, password = PASSWORD) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** The visible main navigation (top bar on desktop, tab bar on mobile). */
export function navTo(page: Page, label: string) {
  return page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: label })
    .click();
}
