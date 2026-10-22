import { test, expect, request } from '@playwright/test';

const origin = 'http://127.0.0.1:4331';
// The synthetic data is dated around this day; freezing the clock keeps "days ago" text stable.
const NOW = new Date('2026-10-22T10:00:00+05:30');
let state;

test.beforeAll(async () => {
  const api = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  const r = await api.post('/api/auth/login', { data: { email: 'admin@qa.invalid', password: 'synthetic-qa-only' } });
  expect(r.ok()).toBeTruthy();
  state = await api.storageState();
});

const SCREENS = [
  ['sales', '/sales/#qualified'],
  ['design', '/design/#pre/make'],
  ['measurement', '/measurement/#all/requests'],
  ['accounts', '/accounts/#summary'],
  ['management', '/management/#overview'],
];

for (const [name, path] of SCREENS) {
  test(name, async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, storageState: state });
    const page = await context.newPage();
    await page.clock.install({ time: NOW });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.locator('#app .main, #app .mg').first().waitFor();
    await expect(page).toHaveScreenshot(name + '.png', {
      // The user menu initials and the bell count come from the session and live notices.
      mask: [page.locator('.user-avatar'), page.locator('.bell .badge')],
    });
    await context.close();
  });
}

test('login', async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use });
  const page = await context.newPage();
  await page.clock.install({ time: NOW });
  await page.goto('/login');
  await page.locator('#email').waitFor();
  await expect(page).toHaveScreenshot('login.png');
  await context.close();
});
