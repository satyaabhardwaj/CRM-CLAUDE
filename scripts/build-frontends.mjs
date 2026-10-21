import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this build with npm run build.');
const root = process.cwd();
for (const module of ['backend', 'sales', 'design', 'accounts', 'measurement', 'management']) {
  for (const args of [['ci'], ['run', 'build']]) {
    const result = spawnSync(process.execPath, [npmCli, ...args],
      { cwd: `${module}/react`, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
for (const module of ['backend', 'sales', 'design', 'accounts', 'measurement', 'management']) {
  // Keep Python function bundles small. Only disposable build dependencies in
  // Vercel's build workspace are removed; local development dependencies remain.
  if (process.env.VERCEL === '1') {
    const deps = resolve(root, module, 'react', 'node_modules');
    if (!deps.startsWith(root + sep)) throw new Error('Invalid dependency directory');
    rmSync(deps, { recursive: true, force: true });
  }
}
