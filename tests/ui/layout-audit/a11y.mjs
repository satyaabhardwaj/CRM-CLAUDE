// Keyboard-only and screen-reader checks for the shell and forms, on the synthetic QA server.
//   node tests/ui/layout-audit/a11y.mjs [--out DIR]
// Reports: controls without an accessible name (from Chrome's accessibility tree), missing landmarks,
// a keyboard Tab walk (order, visible focus, nothing hidden), and Escape closing the drawer, bell and
// user menu with focus going back where it came from.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(ROOT, '.local/ui-polish/a11y'));
const PORT = 4321; // its own port, so it can run beside the layout audit
const origin = `http://127.0.0.1:${PORT}`;
const python = path.join(ROOT, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const PAGES = ['/sales/#qualified', '/design/#pre/make', '/measurement/#all/requests', '/accounts/#clients', '/management/#overview', '/security'];
const NAMED_ROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'tab', 'menuitem', 'spinbutton', 'listbox', 'switch', 'slider']);

const healthy = async () => { try { return (await fetch(origin + '/api/health')).ok; } catch { return false; } };

async function unnamed(page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const missing = [];
  for (const n of nodes) {
    if (n.ignored) continue;
    const role = n.role && n.role.value;
    if (!NAMED_ROLES.has(role)) continue;
    const name = n.name && String(n.name.value || '').trim();
    if (!name) missing.push(role + (n.backendDOMNodeId ? '#' + n.backendDOMNodeId : ''));
  }
  const roles = new Set(nodes.filter((n) => !n.ignored && n.role).map((n) => n.role.value));
  await cdp.detach();
  return { missing, landmarks: { banner: roles.has('banner'), navigation: roles.has('navigation'), main: roles.has('main') } };
}

async function tabWalk(page, steps = 30) {
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.keyboard.press('Tab'); // focus enters the page
  const walk = [];
  for (let i = 0; i < steps; i++) {
    walk.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { name: '(body)' };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
      const region = el.closest('header') ? 'header' : el.closest('.crm-page-toolbar, .stagebar, .management-tools') ? 'toolbar' : el.closest('.crm-sidebar, .crm-drawer') ? 'sidebar' : el.closest('main, .main, .mg') ? 'main' : 'other';
      return { name: (el.getAttribute('aria-label') || el.innerText || el.value || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40), tag: el.tagName.toLowerCase(), visible, ring, region, y: Math.round(r.y) };
    }));
    await page.keyboard.press('Tab');
  }
  // Order follows the screen: header, then filters/tabs, then sidebar and content.
  const order = ['header', 'toolbar', 'sidebar', 'main'];
  const regions = walk.map((w) => w.region).filter((r) => order.includes(r));
  let backwards = 0;
  for (let i = 1; i < regions.length; i++) if (order.indexOf(regions[i]) < order.indexOf(regions[i - 1])) backwards++;
  return { walk, hidden: walk.filter((w) => w.visible === false).length, noRing: walk.filter((w) => w.name !== '(body)' && w.ring === false).length, backwards };
}

async function escapes(page, mobile) {
  const out = {};
  const focusName = () => page.evaluate(() => (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || '').trim().slice(0, 40));
  // User menu
  const menu = page.locator('summary[aria-label="User menu"]');
  await menu.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const opened = await page.locator('details.user-menu[open]').count();
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  out.userMenu = { opened: !!opened, closed: !(await page.locator('details.user-menu[open]').count()), focus: await focusName() };
  // Bell (where the module has one)
  const bell = page.locator('button.bell:not([disabled])').first();
  if (await bell.count()) {
    await bell.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const panel = (await page.locator('.bell-panel, dialog[open]').count()) > 0;
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    out.bell = { opened: panel, closed: !(await page.locator('.bell-panel, dialog[open]').count()), focus: await focusName() };
  }
  // Drawer (phones, modules with a sidebar)
  if (mobile && (await page.locator('button.app-menu').count())) {
    await page.locator('button.app-menu').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const drawer = await page.locator('dialog.crm-drawer[open]').count();
    const trapped = await page.evaluate(() => !!document.activeElement.closest('dialog.crm-drawer'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    out.drawer = { opened: !!drawer, focusInside: trapped, closed: !(await page.locator('dialog.crm-drawer[open]').count()), focus: await focusName() };
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const child = (await healthy()) ? null : spawn(python, ['-B', 'scripts/serve_workflow_qa.py', '--dataset', 'stress', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60 && !(await healthy()); i++) await new Promise((r) => setTimeout(r, 1000));
    const api = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
    await api.post('/api/auth/login', { data: { email: 'admin@qa.invalid', password: 'synthetic-qa-only' } });
    const state = await api.storageState();
    const browser = await chromium.launch();
    const results = [];
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      for (const p of [...PAGES, '/login']) {
        const page = await browser.newPage({ viewport: { width: w, height: h }, storageState: p === '/login' ? undefined : state, isMobile: w < 768, hasTouch: w < 1024 });
        await page.goto(origin + p);
        await page.waitForTimeout(2500);
        const names = await unnamed(page);
        const keys = await tabWalk(page);
        const esc = p === '/login' || p === '/security' ? {} : await escapes(page, w < 768);
        results.push({ page: p, width: w, ...names, keyboard: { hidden: keys.hidden, noRing: keys.noRing, backwards: keys.backwards, first: keys.walk.slice(0, 8).map((x) => x.region + ':' + x.name) }, escape: esc });
        console.log(`${w} ${p.padEnd(26)} unnamed ${names.missing.length} | landmarks ${Object.entries(names.landmarks).filter(([, v]) => !v).map(([k]) => 'no ' + k).join(', ') || 'ok'} | tab: hidden ${keys.hidden}, no ring ${keys.noRing}, out of order ${keys.backwards} | escape ${JSON.stringify(esc)}`);
        await page.close();
      }
    }
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'a11y.json'), JSON.stringify(results, null, 1));
  } finally {
    if (child) child.kill();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
