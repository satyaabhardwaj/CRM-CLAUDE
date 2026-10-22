// Visual regression baselines: each module and the sign-in page at a phone and a desktop width,
// on synthetic data with a frozen clock.
//   npx playwright test -c tests/ui/visual/playwright.config.mjs                    compare
//   npx playwright test -c tests/ui/visual/playwright.config.mjs --update-snapshots  re-record
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');

export default defineConfig({
  testDir: here,
  outputDir: path.join(root, '.local/ui-polish/visual-results'),
  snapshotPathTemplate: '{testDir}/baselines/{arg}-{projectName}{ext}',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' } },
  use: { baseURL: 'http://127.0.0.1:4331', browserName: 'chromium' },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `"${python}" -B scripts/serve_workflow_qa.py --dataset stress --port 4331`,
    cwd: root,
    url: 'http://127.0.0.1:4331/api/health',
    reuseExistingServer: false,
    timeout: 90000,
  },
});
