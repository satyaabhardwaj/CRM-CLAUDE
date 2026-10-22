// Layout audit: visits every screen/state at every audit width on synthetic QA servers and records
// overflow, overlap, clipping, off-screen and touch-target findings, CLS, and focus/scroll survival.
//
//   node tests/ui/layout-audit/audit.mjs [--out DIR] [--only REGEX] [--widths 390,1440] [--browser chromium]
//                                        [--workers 3] [--quick]
//
// It starts its own loopback QA servers (scripts/serve_workflow_qa.py) with synthetic data only.
import { chromium, firefox, webkit, request } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installShiftObserver, inspect, takeShifts } from './checks.mjs';
import { SCREENS, DATA_STATE_SCREENS, Unreachable } from './screens.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return a;
}, []));

export const VIEWPORTS = [
  { name: '320', width: 320, height: 640, touch: true },
  { name: '360', width: 360, height: 740, touch: true },
  { name: '390', width: 390, height: 844, touch: true },
  { name: '414', width: 414, height: 896, touch: true },
  { name: '390-landscape', width: 844, height: 390, touch: true },
  { name: '768', width: 768, height: 1024, touch: true },
  { name: '1024', width: 1024, height: 768, touch: false },
  { name: '1280', width: 1280, height: 800, touch: false },
  { name: '1440', width: 1440, height: 900, touch: false },
  { name: '1920', width: 1920, height: 1080, touch: false },
];
// Zoom and Windows display scaling: the same screen seen as a smaller CSS viewport at a higher pixel ratio.
// Pick them with --widths zoom200,win125,win150 (they are not in the default run).
export const SCALED = [
  { name: 'zoom200', width: 720, height: 450, scale: 2, touch: false }, // 1440 x 900 at 200 % browser zoom
  { name: 'win125', width: 1536, height: 864, scale: 1.25, touch: false }, // 1920 x 1080 at 125 %
  { name: 'win150', width: 1280, height: 720, scale: 1.5, touch: false }, // 1920 x 1080 at 150 %
  { name: 'laptop125', width: 1093, height: 614, scale: 1.25, touch: false }, // 1366 x 768 at 125 %
];
const DYNAMIC_VIEWPORTS = ['390', '1440'];
const isMobileBrowser = (vp) => vp.touch && vp.width < 768;
const SERVERS = { stress: 4311, one: 4312, empty: 4313 };
const CREDENTIALS = { email: 'admin@qa.invalid', password: 'synthetic-qa-only' }; // from scripts/serve_workflow_qa.py
const OUT = path.resolve(args.out || path.join(ROOT, '.local/ui-polish/audit-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')));
const BROWSERS = { chromium, firefox, webkit };
const browserName = args.browser || 'chromium';
const only = args.only ? new RegExp(args.only) : null;
const widths = args.widths ? String(args.widths).split(',') : null;
const viewports = [...VIEWPORTS, ...SCALED].filter((v) => (widths ? widths.includes(v.name) : VIEWPORTS.includes(v)));
const quick = !!args.quick;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const python = process.platform === 'win32' ? path.join(ROOT, '.venv/Scripts/python.exe') : path.join(ROOT, '.venv/bin/python');
const children = [];

async function healthy(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureServer(dataset, port) {
  if (await healthy(port)) return;
  const child = spawn(python, ['-B', 'scripts/serve_workflow_qa.py', '--dataset', dataset, '--port', String(port)],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  children.push(child);
  for (let i = 0; i < 90; i++) {
    if (await healthy(port)) return;
    await sleep(1000);
  }
  throw new Error(`QA server ${dataset} did not start on ${port}`);
}

async function login(port) {
  const origin = `http://127.0.0.1:${port}`;
  const ctx = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  const r = await ctx.post('/api/auth/login', { data: CREDENTIALS });
  if (!r.ok()) throw new Error('QA login failed: ' + r.status());
  const state = await ctx.storageState();
  return { origin, state, api: ctx };
}

// Simulates another screen saving: the open page's next poll sees a new revision.
async function bump(api) {
  for (let i = 0; i < 4; i++) {
    const store = await (await api.get('/api/store')).json();
    store.note = (store.note || '') + '.';
    for (const c of store.clients.slice(0, 25)) c.note = (c.note || '') + ' ';
    const r = await api.put('/api/store', { data: store });
    if (r.ok()) return true;
    await sleep(300);
  }
  return false;
}

async function ready(page, screen) {
  await page.waitForLoadState('load');
  // The login page never reaches network idle (its /api/auth/me body is never read), so keep this short.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  if (screen.wait) await page.locator(screen.wait).first().waitFor({ timeout: 15000 }).catch(() => {});
  // Wait out the "Loading …" status lines every module shows while its first fetch runs.
  await page.waitForFunction(() => !/Loading (Sales|Design|Management|saved Accounts|live measurement|security)/.test(document.body.innerText),
    null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
}

function slug(s) {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

// Header geometry, used to compare the shell across modules and pages.
async function shell(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const top = document.querySelector('#app > .top, header.top');
    // Tab x is measured inside the strip: on phones the strip scrolls the current department into view.
    const tabs = [...document.querySelectorAll('nav.depts a')].map((a) => ({ label: a.textContent.trim(), on: a.classList.contains('on'), ...box(a), x: a.offsetLeft,
      weight: getComputedStyle(a).fontWeight }));
    return { header: box(top), brand: box(document.querySelector('.brand')), avatar: box(document.querySelector('summary[aria-label="User menu"]')),
      search: box(document.querySelector('.crm-global-search, input[type=search]')), tabs,
      scrollbar: window.innerWidth - document.documentElement.clientWidth };
  });
}

// Scroll the main scroller and focus a control, let two polls (4 s each) run after another screen saves,
// then report whether focus and scroll survived.
async function focusScroll(page, api) {
  const before = await page.evaluate(() => {
    const scrollers = [document.scrollingElement, ...document.querySelectorAll('main, .main, section, div')].filter((el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      return el.scrollHeight > el.clientHeight + 40 && (el === document.scrollingElement || /auto|scroll/.test(cs.overflowY));
    }).sort((a, b) => b.scrollHeight - a.scrollHeight);
    const s = scrollers[0];
    if (s) s.scrollTop = Math.round((s.scrollHeight - s.clientHeight) / 2);
    if (s) s.setAttribute('data-audit-scroller', '1');
    const target = [...document.querySelectorAll('main button, .main button, main a[href], button.row')].find((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.top > 0 && r.bottom < innerHeight;
    });
    if (target) { target.setAttribute('data-audit-focus', '1'); target.focus(); }
    return { scrollTop: s ? s.scrollTop : null, scroller: s ? (s === document.scrollingElement ? 'document' : s.className || s.tagName) : null,
      focused: !!target && document.activeElement === target, label: target ? (target.innerText || target.getAttribute('aria-label') || '').trim().slice(0, 40) : null };
  });
  await page.evaluate(() => { window.__auditShifts = []; });
  const bumped = await bump(api);
  await page.waitForTimeout(9000);
  const after = await page.evaluate(() => {
    const s = document.querySelector('[data-audit-scroller]') || (document.scrollingElement.hasAttribute('data-audit-scroller') ? document.scrollingElement : null);
    const t = document.querySelector('[data-audit-focus]');
    return { scrollTop: s ? s.scrollTop : null, scrollerKept: !!s, focusKept: !!t && document.activeElement === t, targetKept: !!t,
      active: document.activeElement ? document.activeElement.tagName + '.' + document.activeElement.className : null };
  });
  const shifts = await page.evaluate(takeShifts);
  return { bumped, before, after, refreshCls: shifts.total, refreshShifts: shifts.entries,
    scrollLost: before.scrollTop != null && (!after.scrollerKept || Math.abs((after.scrollTop || 0) - before.scrollTop) > 4),
    focusLost: before.focused && !after.focusKept };
}

async function tabSwitch(page, screen) {
  // Programmatic click, so the Layout Instability API does not discount the shift as user input.
  const result = await page.evaluate(({ name, role }) => {
    const all = [...document.querySelectorAll('nav.stagebar button, .stagebar [role=tab], nav.tabs button, .crm-nav-item, nav.depts a')];
    const target = all.find((b) => b.textContent.replace(/\s+/g, ' ').trim().startsWith(name));
    if (!target) return { found: false };
    const siblings = [...target.parentElement.children];
    const before = siblings.map((s) => Math.round(s.getBoundingClientRect().x));
    window.__auditShifts = [];
    target.click();
    return { found: true, before, parentSel: target.parentElement.className, index: siblings.indexOf(target) };
  }, { name: screen.tabTo, role: screen.tabRole });
  if (!result.found) return { found: false };
  await page.waitForTimeout(1500);
  const after = await page.evaluate((cls) => {
    const parent = [...document.querySelectorAll('nav.stagebar, .stagebar, nav.tabs, nav, .crm-nav-group')].find((p) => p.className === cls) ||
      document.querySelector('nav.stagebar, .stagebar, nav.tabs');
    return parent ? [...parent.children].map((s) => Math.round(s.getBoundingClientRect().x)) : [];
  }, result.parentSel);
  const shifts = await page.evaluate(takeShifts);
  const moved = result.before.map((x, i) => (after[i] == null ? 0 : after[i] - x)).filter((d) => Math.abs(d) > 0.5);
  return { found: true, tabCls: shifts.total, tabShifts: shifts.entries, siblingsMovedPx: moved };
}

async function runState(browser, vp, screen, server, opts = {}) {
  const record = { screen: screen.id, module: screen.module, viewport: vp.name, width: vp.width, height: vp.height,
    dataset: opts.dataset || 'stress', variant: opts.variant || 'default', browser: browserName };
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale || 1, hasTouch: vp.touch, isMobile: isMobileBrowser(vp) && browserName !== 'firefox',
    storageState: screen.loggedOut ? undefined : server.state, baseURL: server.origin, reducedMotion: 'no-preference',
  });
  await context.addInitScript(installShiftObserver);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message).slice(0, 200)));
  try {
    if (opts.route) await opts.route(page);
    const t0 = Date.now();
    await page.goto(screen.path, { waitUntil: 'domcontentloaded' });
    if (opts.captureEarly) {
      await page.waitForTimeout(opts.captureEarly);
      record.early = await page.evaluate(inspect, { touch: vp.touch });
      record.earlyShot = await shot(page, record, 'early');
    }
    await ready(page, screen);
    record.loadMs = Date.now() - t0;
    record.loadCls = (await page.evaluate(takeShifts)).total;
    if (screen.setup) {
      try {
        await screen.setup(page);
      } catch (e) {
        if (e instanceof Unreachable) {
          record.status = e.blocked ? 'blocked' : 'unreachable';
          record.reason = e.message;
          if (e.blocked) {
            record.result = await page.evaluate(inspect, { touch: vp.touch });
            record.screenshot = await shot(page, record, 'blocked');
          }
          return record;
        }
        throw e;
      }
      await page.waitForTimeout(300);
      record.setupCls = (await page.evaluate(takeShifts)).total;
    }
    record.result = await page.evaluate(inspect, { touch: vp.touch });
    record.shell = await shell(page);
    const r = record.result;
    const serious = r.pageOverflow > 1 || (r.counts.overlap || 0) + (r.counts['clipped-text'] || 0) + (r.counts['off-screen'] || 0) + (r.counts.obscured || 0) > 0;
    if (serious || (opts.alwaysShot) || DYNAMIC_VIEWPORTS.includes(vp.name)) record.screenshot = await shot(page, record);
    if (screen.tabTo && !opts.dataset) record.tab = await tabSwitch(page, screen);
    if (screen.refresh && !quick && !opts.dataset && !opts.variant && DYNAMIC_VIEWPORTS.includes(vp.name)) record.dynamic = await focusScroll(page, server.api);
    record.status = 'ok';
  } catch (e) {
    record.status = 'error';
    record.reason = String(e.message).split('\n')[0].slice(0, 300);
    record.screenshot = await shot(page, record, 'error').catch(() => null);
  } finally {
    record.consoleErrors = consoleErrors;
    await context.close();
  }
  return record;
}

async function shot(page, record, suffix) {
  const dir = path.join(OUT, 'shots');
  fs.mkdirSync(dir, { recursive: true });
  const name = slug([record.browser, record.dataset, record.variant, record.screen, record.viewport, suffix].filter(Boolean).join('_')) + '.jpg';
  await page.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 60 });
  return 'shots/' + name;
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i++];
      out.push(await fn(item));
      if (out.length % 25 === 0) console.log(`  ${out.length}/${items.length}`);
    }
  }));
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [dataset, port] of Object.entries(SERVERS)) await ensureServer(dataset, port);
  const servers = {};
  for (const [dataset, port] of Object.entries(SERVERS)) servers[dataset] = await login(port);
  const browser = await BROWSERS[browserName].launch();
  const workers = Number(args.workers || 3);
  const screens = SCREENS.filter((s) => !only || only.test(s.id));
  const jobs = [];
  for (const vp of viewports)
    for (const s of screens) {
      if ((s.minWidth && vp.width < s.minWidth) || (s.maxWidth && vp.width > s.maxWidth)) continue;
      jobs.push({ vp, s, server: servers.stress });
    }
  // Data states: 0 rows and 1 row, loading and error, on the landing pages at a phone and a desktop width.
  const dataViewports = viewports.filter((v) => DYNAMIC_VIEWPORTS.includes(v.name));
  const dataScreens = DATA_STATE_SCREENS.filter((s) => !only || only.test(s.id));
  const delay = (ms) => async (page) => page.route(/\/api\/(store|measurement\/requests)/, async (route) => {
    await sleep(ms);
    await route.continue();
  });
  const fail = async (page) => page.route(/\/api\/(store|measurement\/requests)/, (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic outage for the layout audit' }) }));
  if (!quick)
    for (const vp of dataViewports)
      for (const s of dataScreens) {
        jobs.push({ vp, s, server: servers.empty, opts: { dataset: 'empty', alwaysShot: true } });
        jobs.push({ vp, s, server: servers.one, opts: { dataset: 'one' } });
        jobs.push({ vp, s, server: servers.stress, opts: { variant: 'loading', route: delay(3000), captureEarly: 1200 } });
        jobs.push({ vp, s, server: servers.stress, opts: { variant: 'error', route: fail, alwaysShot: true } });
      }
  console.log(`Layout audit: ${jobs.length} states, ${browserName}, ${viewports.length} widths -> ${OUT}`);
  const started = Date.now();
  const results = await pool(jobs, workers, (j) => runState(browser, j.vp, j.s, j.server, j.opts));
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ browser: browserName, started: new Date(started).toISOString(),
    seconds: Math.round((Date.now() - started) / 1000), viewports, results }, null, 1));
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s. Results: ${path.join(OUT, 'results.json')}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => {
  for (const c of children) c.kill();
});
