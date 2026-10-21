// Screenshots of each module at chosen widths, on the synthetic stress QA server, for before/after comparison.
//   node tests/ui/layout-audit/shots.mjs --out DIR [--widths 390,1440] [path ...]
// Paths default to one landing page per module. On Git Bash, set MSYS_NO_PATHCONV=1 when passing paths.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes('--' + name) ? argv[argv.indexOf('--' + name) + 1] : fallback);
const out = path.resolve(opt('out', path.join(ROOT, '.local/ui-polish/shots')));
const widths = opt('widths', '390,1440').split(',').map(Number);
const paths = argv.filter((a, i) => a.startsWith('/') && !['--out', '--widths'].includes(argv[i - 1]));
const PAGES = paths.length ? paths : ['/sales/#qualified', '/design/#pre/make', '/measurement/#all/requests', '/accounts/#summary', '/management/#overview'];
const origin = 'http://127.0.0.1:4311';
const python = path.join(ROOT, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');

fs.mkdirSync(out, { recursive: true });
const healthy = async () => { try { return (await fetch(origin + '/api/health')).ok; } catch { return false; } };
const child = (await healthy()) ? null : spawn(python, ['-B', 'scripts/serve_workflow_qa.py', '--dataset', 'stress', '--port', '4311'], { cwd: ROOT, stdio: 'ignore' });
try {
  for (let i = 0; i < 60 && !(await healthy()); i++) await new Promise((r) => setTimeout(r, 1000));
  const api = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } });
  await api.post('/api/auth/login', { data: { email: 'admin@qa.invalid', password: 'synthetic-qa-only' } });
  const state = await api.storageState();
  const browser = await chromium.launch();
  for (const w of widths) {
    for (const p of PAGES) {
      const page = await browser.newPage({ viewport: { width: w, height: w < 768 ? 844 : 900 }, storageState: state, isMobile: w < 768, hasTouch: w < 1024 });
      await page.goto(origin + p);
      await page.waitForTimeout(2500);
      const name = `${w}-${p.split('/')[1]}.png`;
      await page.screenshot({ path: path.join(out, name) });
      console.log(name);
      await page.close();
    }
  }
  await browser.close();
} finally {
  if (child) child.kill();
}
