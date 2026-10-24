// Twenty independent synthetic sessions polling at the app's four-second cadence.
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:4342';
if (origin !== 'http://127.0.0.1:4342') throw new Error('Refusing a non-synthetic load-test target');
const seconds = Number(process.env.LOAD_SECONDS || 300);
if (!(seconds >= 10 && seconds <= 300)) throw new Error('Use 10..300 seconds');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cookies = [];
for (let i = 0; i < 20; i++) {
  const response = await fetch(origin + '/api/auth/login', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `qa-load-${i}@qa.invalid`, password: 'synthetic-qa-only' }),
  });
  if (response.status !== 200) throw new Error('Synthetic load-user sign-in failed');
  cookies.push(response.headers.getSetCookie().map(v => v.split(';')[0]).join('; '));
}
const check = await (await fetch(origin + '/api/store', { headers: { Cookie: cookies[0] } })).json();
if (check.clients.length < 540 || !check.clients.every(c => /^qa-\d+$/.test(c.id))) throw new Error('Expected synthetic stress data');
const times = []; let errors = 0;
const deadline = performance.now() + seconds * 1000;
await Promise.all(cookies.map(async (cookie, index) => {
  await delay(index * 200);
  while (performance.now() < deadline) {
    const start = performance.now();
    try {
      const response = await fetch(origin + '/api/store', { headers: { Cookie: cookie }, signal: AbortSignal.timeout(10000) });
      await response.arrayBuffer();
      if (!response.ok) errors++;
    } catch { errors++; }
    times.push(performance.now() - start);
    await delay(Math.max(0, 4000 - (performance.now() - start)));
  }
}));
times.sort((a,b) => a-b);
const report = { users: 20, seconds, requests: times.length, errors,
  p95_ms: Math.round(times[Math.ceil(times.length * 0.95) - 1]), max_ms: Math.round(times.at(-1)) };
report.pass = errors === 0 && report.p95_ms < 300 && report.max_ms <= 1000;
console.log(JSON.stringify(report, null, 2));
if (process.env.LOAD_OUT) fs.writeFileSync(process.env.LOAD_OUT, JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
