// Synthetic Sales timing. No live target, external providers, or real identities.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const origin = 'http://127.0.0.1:4342';
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(15000);
    const response = await context.request.post(origin + '/api/auth/login', {
      headers: { Origin: origin }, data: { email: 'sales@qa.invalid', password: 'synthetic-qa-only' },
    });
    if (response.status() !== 200) throw new Error('Synthetic sign-in failed');
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const start = performance.now();
    await page.goto(origin + '/sales/#qualified');
    await page.waitForFunction(() => window.Kit?.store?.data?.clients?.length >= 540);
    await page.locator('summary[aria-label="User menu"]').waitFor();
    await page.locator('.sales-list-pick, main button.row').first().waitFor();
    const usable_ms = Math.round(performance.now() - start);
    await page.waitForTimeout(1000);
    const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const before = await metric();
    const refresh = page.waitForResponse(r => r.url().endsWith('/api/store') && r.request().method() === 'GET');
    await refresh;
    await page.waitForTimeout(150);
    const after = await metric();
    results.push({ width, usable_ms, refresh_interval_main_thread_ms: Math.round((after.TaskDuration - before.TaskDuration) * 1000) });
    await context.close();
  }
} finally { await browser.close(); }
const report = { scope: 'Sales, synthetic 540 clients, Chromium; whole polling interval includes timers and rendering', results };
fs.writeFileSync('.local/go-live-browser-performance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (results.some(r => r.usable_ms >= 2000 || r.refresh_interval_main_thread_ms >= 50)) process.exitCode = 1;
