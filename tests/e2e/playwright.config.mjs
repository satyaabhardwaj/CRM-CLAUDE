import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.QA_ORIGIN || 'http://127.0.0.1:4341';
if (baseURL !== 'http://127.0.0.1:4341') throw new Error('Local synthetic suite requires its dedicated QA target');
export default defineConfig({
  testDir: '.', timeout: 60000, workers: 1, fullyParallel: false,
  outputDir: '../../.local/e2e-results', reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: ['chromium', 'firefox', 'webkit'].flatMap(browserName =>
    ['phone', 'desktop'].map(size => ({ name: `${browserName}-${size}`, use: {
      browserName, viewport: { width: size === 'phone' ? 390 : 1440, height: size === 'phone' ? 844 : 900 },
    } }))),
  webServer: {
    command: `${process.env.QA_PYTHON || 'python'} -B scripts/serve_workflow_qa.py --e2e --port 4341`,
    cwd: fileURLToPath(new URL('../..', import.meta.url)), url: `${baseURL}/api/health`, timeout: 90000,
    reuseExistingServer: process.env.QA_REUSE_SERVER === '1',
  },
});
