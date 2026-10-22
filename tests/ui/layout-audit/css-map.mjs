// CSS inventory: breakpoints, !important, hard-coded colours and sizes, and selectors defined in more than one file.
//   node tests/ui/layout-audit/css-map.mjs [--json OUT.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = ['shared/tokens.css', 'shared/look.css', 'shared/ui.css', 'shared/workspace.css', 'measurement/look.css',
  'management/look.css', 'sales/react/src/style.css', 'design/react/src/style.css', 'measurement/react/src/style.css',
  'accounts/react/src/style.css', 'management/react/src/style.css', 'backend/react/src/auth.css'];

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function rules(css) {
  // Flat walk: returns [selector, body, media] for every rule, with the enclosing @media text.
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const head = stack.pop();
      // Keyframe steps (from, to, 50%) are not selectors.
      if (head !== undefined && !head.startsWith('@') && !stack.some((s) => s.startsWith('@keyframes'))) out.push([head, buf.trim(), stack.filter((s) => s.startsWith('@media')).join(' ')]);
      buf = '';
    } else buf += ch;
  }
  return out;
}

// Split a selector list on commas that are not inside :is(), :not() or attribute brackets.
function topLevel(list) {
  const parts = [];
  let depth = 0,
    buf = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else buf += ch;
  }
  return [...parts, buf];
}

const report = { files: {}, duplicates: [] };
const owners = new Map();
for (const f of FILES) {
  const full = path.join(ROOT, f);
  if (!fs.existsSync(full)) continue;
  const raw = fs.readFileSync(full, 'utf8');
  const css = strip(raw);
  const media = {};
  for (const m of css.matchAll(/@media([^{]+)\{/g)) {
    const q = m[1].trim().replace(/\s+/g, ' ');
    media[q] = (media[q] || 0) + 1;
  }
  const important = [];
  raw.split('\n').forEach((line, i) => { if (line.includes('!important')) important.push(i + 1); });
  const hex = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  const rgb = (css.match(/rgba?\(/g) || []).length;
  const px = (css.match(/\b\d+(\.\d+)?px\b/g) || []).length;
  const vars = (css.match(/var\(--/g) || []).length;
  const zIndex = [...css.matchAll(/z-index:\s*(-?\d+)/g)].map((m) => Number(m[1]));
  const fontSizes = [...new Set([...css.matchAll(/font-size:\s*([\d.]+px)/g)].map((m) => m[1]))].sort((a, b) => parseFloat(a) - parseFloat(b));
  const rs = rules(css);
  for (const [sel, , m] of rs)
    for (const s of topLevel(sel).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
      const key = m ? s + ' @ ' + m : s;
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(f);
    }
  report.files[f] = { lines: raw.split('\n').length, rules: rs.length, media, important, hex, rgb, px, vars, zIndex, fontSizes };
}
// Count a selector as duplicated only when two files that load on the same page both define it.
const SHARED = ['shared/tokens.css', 'shared/look.css', 'shared/ui.css', 'shared/workspace.css'];
const PAGES = {
  sales: [...SHARED, 'sales/react/src/style.css'],
  design: [...SHARED, 'design/react/src/style.css'],
  measurement: [...SHARED, 'measurement/look.css', 'measurement/react/src/style.css'],
  accounts: [...SHARED, 'accounts/react/src/style.css'],
  management: [...SHARED, 'management/look.css', 'management/react/src/style.css'],
  auth: ['shared/tokens.css', 'backend/react/src/auth.css'],
};
for (const [sel, files] of owners) {
  const pages = Object.entries(PAGES).filter(([, list]) => list.filter((f) => files.has(f)).length > 1).map(([p]) => p);
  if (pages.length) report.duplicates.push({ selector: sel, files: [...files], pages });
}
report.duplicates.sort((a, b) => b.files.length - a.files.length);

const breakpoints = {};
for (const [f, d] of Object.entries(report.files))
  for (const [q, n] of Object.entries(d.media)) {
    const px = q.match(/(max|min)-width:\s*(\d+(?:\.\d+)?)px/);
    if (px) (breakpoints[px[1] + ' ' + px[2]] ||= []).push(f + (n > 1 ? ' x' + n : ''));
  }
report.breakpoints = breakpoints;
report.totals = {
  important: Object.values(report.files).reduce((a, d) => a + d.important.length, 0),
  hex: Object.values(report.files).reduce((a, d) => a + d.hex, 0),
  px: Object.values(report.files).reduce((a, d) => a + d.px, 0),
  duplicates: report.duplicates.length,
  zIndex: [...new Set(Object.values(report.files).flatMap((d) => d.zIndex))].sort((a, b) => a - b),
  fontSizes: [...new Set(Object.values(report.files).flatMap((d) => d.fontSizes))].sort((a, b) => parseFloat(a) - parseFloat(b)),
};

const i = process.argv.indexOf('--json');
if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(report, null, 1));
console.log('Breakpoints:');
for (const [b, fs_] of Object.entries(breakpoints).sort((a, b) => parseInt(a[0].split(' ')[1]) - parseInt(b[0].split(' ')[1]))) console.log('  ' + b.padEnd(10) + fs_.join(', '));
console.log('Totals:', JSON.stringify(report.totals));
console.log('Per file (rules / !important / hex / px / var):');
for (const [f, d] of Object.entries(report.files)) console.log('  ' + f.padEnd(34) + [d.rules, d.important.length, d.hex, d.px, d.vars].join(' / '));
console.log('Top duplicated selectors:');
for (const d of report.duplicates.slice(0, 15)) console.log('  ' + d.selector + '  <- ' + d.files.join(', '));
