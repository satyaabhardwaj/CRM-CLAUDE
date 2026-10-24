// Synthetic QA only. Measures completed responses, including body consumption.
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:4311';
if (!/^http:\/\/127\.0\.0\.1:(4311|4342|4343)$/.test(origin)) throw new Error('Refusing a non-QA target');
const login = await fetch(origin + '/api/auth/login', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@qa.invalid', password: 'synthetic-qa-only' }),
});
if (login.status !== 200) throw new Error('QA sign-in failed');
const cookie = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
const headers = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' };
const samples = { get: [], save: [] };
let clients;
for (let i = 0; i < 30; i++) {
  let start = performance.now();
  const response = await fetch(origin + '/api/store', { headers });
  const store = await response.json();
  samples.get.push(performance.now() - start);
  if (!response.ok || store.clients.length < 540 || !store.clients.every(c => /^qa-\d+$/.test(c.id))) throw new Error('Expected synthetic stress data');
  clients = store.clients.length;
  store.clients[0].qaPerformance = i;
  start = performance.now();
  const saved = await fetch(origin + '/api/store', { method: 'PUT', headers, body: JSON.stringify(store) });
  await saved.arrayBuffer();
  samples.save.push(performance.now() - start);
  if (!saved.ok) throw new Error(`Save failed: ${saved.status}`);
}
const result = { clients, samples: 30 };
for (const [name, values] of Object.entries(samples)) {
  values.sort((a,b) => a-b);
  result[name] = { p95_ms: Math.round(values[Math.ceil(values.length * 0.95)-1]), max_ms: Math.round(values.at(-1)) };
}
console.log(JSON.stringify(result, null, 2));
if (process.env.PERFORMANCE_OUT) fs.writeFileSync(process.env.PERFORMANCE_OUT, JSON.stringify(result, null, 2));
