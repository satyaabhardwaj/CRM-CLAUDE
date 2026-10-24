import { test as base, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const origin = 'http://127.0.0.1:4341';
const password = 'synthetic-qa-only';
const sandbox = { window: {}, Kit: { store: {}, now: () => new Date().toISOString() } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL('../../shared/rules.js', import.meta.url), 'utf8'), sandbox);
function totp() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...'JBSWY3DPEHPK3PXP'].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(v => parseInt(v, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  return ((h.readUInt32BE(h[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
const test = base.extend({
  admin: [async ({ playwright }, use, workerInfo) => {
    const api = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
    expect((await api.post('/api/auth/login', { data: { email: `admin-${workerInfo.project.name}@qa.invalid`, password } })).status()).toBe(202);
    expect((await api.get('/api/store')).status()).toBe(401);
    let verified = await api.post('/api/auth/mfa/verify', { data: { code: totp() } });
    if (verified.status() === 401) {
      // A restarted worker must wait for a fresh authenticator counter; never disable replay checks.
      await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
      verified = await api.post('/api/auth/mfa/verify', { data: { code: totp() } });
    }
    expect(verified.status()).toBe(200);
    await use(api); await api.dispose();
  }, { scope: 'worker' }],
});
async function login(request, role) {
  expect((await request.post('/api/auth/login', { headers: { Origin: origin }, data: { email: `${role}@qa.invalid`, password } })).status()).toBe(200);
}
async function edit(api, id, mutate, expected = 200) {
  const row = await (await api.get(`/api/clients/${id}`)).json();
  sandbox.window.SalesLogic.ensure(row.payload);
  mutate(row.payload);
  const result = await api.put(`/api/clients/${id}`, { data: { version: row.version, payload: row.payload } });
  expect(result.status(), await result.text()).toBe(expected);
}

test('password sign-in, navigation, mobile layout and sign-out', async ({ page }, info) => {
  await page.goto('/login?next=%2Fsales%2F');
  await page.getByLabel('Email', { exact: true }).fill(`sales-${info.project.name}@qa.invalid`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/sales\//, { timeout: 10000 });
  for (const module of ['sales', 'design', 'accounts', 'measurement', 'management']) {
    await page.goto(`/${module}/`);
    await expect(page.locator('summary[aria-label="User menu"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.locator('summary[aria-label="User menu"]').click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get('/api/store')).status()).toBe(401);
});

test('authenticator challenge completes in the browser', async ({ page }, info) => {
  await page.goto('/login?next=%2Fmanagement%2F');
  await page.getByLabel('Email', { exact: true }).fill(`admin-${info.project.name}@qa.invalid`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your sign-in', exact: true })).toBeVisible();
  expect((await page.request.get('/api/store')).status()).toBe(401);
  const code = totp();
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1} of 6`, { exact: true }).fill(code[i]);
  await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/management\//, { timeout: 10000 });
  await expect(page.locator('summary[aria-label="User menu"]')).toBeVisible();
});

test('department edits and Accounts approval refusals', async ({ playwright, admin }) => {
  const allowed = { sales: c => { c.city = 'Synthetic city'; }, design: c => { c.design.designer = 'Synthetic designer'; },
    measurement: c => { c.measurement = { requestedAt: '2026-10-24' }; }, accounts: c => { c.approvalNotes = { qa: 'Synthetic' }; } };
  for (const [role, mutate] of Object.entries(allowed)) {
    const api = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
    await login(api, role);
    await edit(api, 'qa-qualified', mutate);
    await edit(api, 'qa-qualified', c => { if (role === 'accounts') c.city = 'Forbidden'; else c.gates = { design: { at: '2026-10-24', by: role } }; }, 403);
    await api.dispose();
  }
  await edit(admin, 'qa-qualified', c => { c.gates = {}; });
});

test('expired session retains an opportunity draft and returns to the same page', async ({ page }, info) => {
  await login(page.request, `sales-${info.project.name}`);
  await page.goto('/sales/#qualified');
  await page.getByRole('button', { name: 'New opportunity', exact: true }).click();
  const name = `Synthetic retained ${info.project.name}`;
  await page.getByLabel('Customer name', { exact: true }).fill(name);
  await page.getByLabel('Phone', { exact: true }).fill('0000000000');
  await page.getByLabel('Source', { exact: true }).selectOption('Walk-in');
  let expired = false;
  await page.route('**/api/store', async route => {
    if (!expired && route.request().method() === 'PUT') {
      expired = true;
      expect((await page.request.post('/__qa__/expire-session', { headers: { Origin: origin } })).status()).toBe(200);
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save opportunity', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/, { timeout: 10000 });
  expect(new URL(page.url()).searchParams.get('next')).toBe('/sales/#qualified');
  expect(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('crm.draft.')))).toBe(true);
  await page.getByLabel('Email', { exact: true }).fill(`sales-${info.project.name}@qa.invalid`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/#qualified/, { timeout: 10000 });
  await expect.poll(async () => (await (await page.request.get('/api/store')).json()).clients.some(c => c.name === name)).toBe(true);
});

test('workflow persistence, Bin restore and concurrent-write rejection', async ({ admin }, info) => {
  const id = `qa-e2e-${info.project.name}`;
  const store = await (await admin.get('/api/store')).json();
  store.clients.push({ id, cid: `C-${id}`, pid: `P-${id}`, name: 'Synthetic workflow', stage: 'qualified', order: { products: [{ value: 100000 }], bankPct: 100 }, payment: { receipts: [] }, design: {}, gates: {} });
  expect((await admin.put('/api/store', { data: store })).status()).toBe(200);
  for (const stage of ['design', 'token', 'booked']) await edit(admin, id, c => { c.stage = stage; });
  await edit(admin, id, c => { c.payment.receipts = [{ id: 'qa-receipt', amount: 118000, status: 'Confirmed', kind: 'bank', date: '2026-10-24' }]; });
  await edit(admin, id, c => { c.gates.design = { at: '2026-10-24', by: 'qa-admin' }; c.stage = 'post'; c.measurement = { requestedAt: '2026-10-24' }; });
  const before = await (await admin.get(`/api/clients/${id}`)).json();
  await edit(admin, id, c => { c.stage = 'bin'; c.binned = { stage: 'post', at: '2026-10-24' }; });
  await edit(admin, id, c => { c.stage = 'post'; delete c.binned; });
  const row = await (await admin.get(`/api/clients/${id}`)).json();
  expect(row.payload).toEqual(before.payload);
  const results = await Promise.all(['one', 'two'].map(city => admin.put(`/api/clients/${id}`, { data: { version: row.version, payload: { ...row.payload, city } } })));
  expect(results.map(r => r.status()).sort()).toEqual([200, 409]);
  const saved = await (await admin.get(`/api/clients/${id}`)).json();
  expect(saved.version).toBe(row.version + 1);
  expect(saved.payload.payment).toEqual(row.payload.payment);
});

test('private file roundtrip, anonymous denial and factory mail refusal', async ({ admin, request }, info) => {
  const name = `synthetic-${info.project.name}.txt`;
  const signed = await (await admin.post('/api/uploads/sign/qa-qualified', { data: { name, size: 9 } })).json();
  expect((await admin.put(signed.url, { data: 'synthetic' })).status()).toBe(200);
  expect(await (await admin.get(`/data/uploads/qa-qualified/${name}`)).text()).toBe('synthetic');
  expect((await request.get(`/data/uploads/qa-qualified/${name}`)).status()).toBe(401);
  expect((await admin.post('/api/mail/send', { data: { kind: 'factory' } })).status()).toBe(403);
});

test('email code and unauthenticated errors', async ({ page }) => {
  await page.goto('/login?next=%2Faccounts%2F');
  await page.getByLabel('Email', { exact: true }).fill('reader@qa.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const code = await (await page.request.get('/__qa__/outbox?email=reader%40qa.invalid')).json();
  expect((await page.request.get('/api/store')).status()).toBe(401);
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1} of 6`, { exact: true }).fill(code.code[i]);
  await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/accounts\//, { timeout: 10000 });
  expect((await page.request.put('/api/store', { headers: { Origin: origin }, data: { rev: 0, clients: [] } })).status()).toBe(403);
});

test('Users page adds, resets and deactivates a synthetic person', async ({ page, admin }, info) => {
  await page.context().addCookies((await admin.storageState()).cookies);
  await page.goto('/management/#users');
  const email = `ui-staff-${info.project.name}-${Date.now()}@qa.invalid`;
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption('reader');
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await expect(page.locator('.management-secret')).toBeVisible();
  await page.getByRole('button', { name: 'Done, hide it', exact: true }).click();
  const person = page.locator('.management-user-row').filter({ hasText: email });
  await person.getByRole('button', { name: 'Reset password', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.locator('.management-secret')).toBeVisible();
  await page.getByRole('button', { name: 'Done, hide it', exact: true }).click();
  await person.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(person.getByText('Deactivated', { exact: true })).toBeVisible();
});

test('Users add, reset and deactivate preserve account identity', async ({ admin }, info) => {
  const created = await (await admin.post('/api/admin/users', { data: { email: `${info.project.name}-${Date.now()}@qa.invalid`, role: 'reader' } })).json();
  expect(created.id).toBeTruthy();
  expect(created.temporary_password.length).toBeGreaterThanOrEqual(12);
  const reset = await admin.post(`/api/admin/users/${created.id}/reset-password`);
  expect(reset.status()).toBe(200);
  expect((await reset.json()).temporary_password).not.toBe(created.temporary_password);
  expect((await admin.post(`/api/admin/users/${created.id}/deactivate`)).status()).toBe(200);
  const listing = await (await admin.get('/api/admin/users')).json();
  expect(listing.users.find(u => u.id === created.id).active).toBeFalsy();
});
