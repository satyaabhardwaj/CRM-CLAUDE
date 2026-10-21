// Turns results.json into a ranked issue list (issues.json + summary.md) next to it.
//   node tests/ui/layout-audit/report.mjs .local/ui-polish/audit-chromium/results.json
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
const dir = path.dirname(file);
const { results, browser } = JSON.parse(fs.readFileSync(file, 'utf8'));
const MOBILE = new Set(['320', '360', '390', '414', '390-landscape']);
const WEIGHT = { 'squeezed-scroll-area': 95, blocked: 95, 'page-overflow': 100, obscured: 80, 'off-screen': 70, 'focus-lost': 70, 'scroll-lost': 70, overlap: 60,
  'clipped-text': 50, 'cls': 60, 'tab-shift': 55, 'shell-shift': 55, error: 90, unreachable: 30, 'touch-target': 25,
  'truncated-no-tooltip': 10, 'console-error': 40 };

// Selectors carry row-specific text; normalise them so one component is one issue.
const norm = (s) => (s || '').replace(/\[aria-label="[^"]*"\]/g, '[aria-label]').replace(/#[\w-]*\d[\w-]*/g, '#*');

const issues = new Map();
function add(kind, module, selector, r, detail, example) {
  const key = [kind, module, norm(selector)].join('|');
  if (!issues.has(key)) issues.set(key, { kind, module, selector: norm(selector), widths: new Set(), screens: new Set(), hits: 0, examples: [] });
  const i = issues.get(key);
  i.widths.add(r.viewport);
  i.screens.add(r.screen + (r.dataset !== 'stress' ? ' [' + r.dataset + ']' : '') + (r.variant !== 'default' ? ' [' + r.variant + ']' : ''));
  i.hits += 1;
  if (i.examples.length < 3 && (example || r.screenshot)) i.examples.push({ screen: r.screen, viewport: r.viewport, shot: r.screenshot, detail, text: example });
}

for (const r of results) {
  if (r.status === 'error') add('error', r.module, r.reason, r, r.reason);
  if (r.status === 'unreachable') add('unreachable', r.module, r.screen + ': ' + r.reason, r, r.reason);
  if (r.status === 'blocked') add('blocked', r.module, r.screen.split('/')[0] + ': ' + r.reason, r, r.reason);
  for (const e of r.consoleErrors || []) add('console-error', r.module, e, r, e);
  if (!r.result) continue;
  for (const [kind, list] of Object.entries(r.result.findings))
    for (const f of list) add(kind, r.module, f.selector, r, f.detail, f.text);
  for (const [k, v] of [['load', r.loadCls], ['setup', r.setupCls]])
    if (v > 0.05) add('cls', r.module, 'CLS on ' + k, r, { value: +v.toFixed(3) });
  if (r.dynamic) {
    if (r.dynamic.refreshCls > 0.05) add('cls', r.module, 'CLS on background refresh', r, { value: +r.dynamic.refreshCls.toFixed(3), shifts: r.dynamic.refreshShifts });
    if (r.dynamic.focusLost) add('focus-lost', r.module, 'focus lost after background refresh', r, r.dynamic.after);
    if (r.dynamic.scrollLost) add('scroll-lost', r.module, 'scroll lost after background refresh', r, { before: r.dynamic.before.scrollTop, after: r.dynamic.after.scrollTop });
  }
  if (r.tab && r.tab.found) {
    if (r.tab.tabCls > 0.05) add('cls', r.module, 'CLS on tab switch', r, { value: +r.tab.tabCls.toFixed(3), shifts: r.tab.tabShifts });
    if (r.tab.siblingsMovedPx.length) add('tab-shift', r.module, 'tabs move when the active tab changes', r, { movedPx: r.tab.siblingsMovedPx });
  }
}

// Shell consistency: the department tabs and header should sit in the same place in every module at a given width.
const shellRows = [];
const byWidth = {};
for (const r of results)
  if (r.shell && r.dataset === 'stress' && r.variant === 'default' && r.status === 'ok' && r.shell.tabs.length && /\/(qualified|pre\/make|overview|summary)$/.test(r.screen))
    (byWidth[r.viewport] ||= {})[r.module] = r.shell;
for (const [w, mods] of Object.entries(byWidth)) {
  const heights = Object.fromEntries(Object.entries(mods).map(([m, s]) => [m, s.header && s.header.h]));
  const tabX = Object.fromEntries(Object.entries(mods).map(([m, s]) => [m, s.tabs.map((t) => t.x)]));
  const first = Object.values(tabX)[0];
  const tabsMove = Object.values(tabX).some((xs) => xs.some((x, i) => Math.abs(x - first[i]) > 1));
  const hs = Object.values(heights).filter(Boolean);
  shellRows.push({ width: w, heights, tabX, tabsMove, heightSpread: Math.max(...hs) - Math.min(...hs) });
  if (tabsMove || Math.max(...hs) - Math.min(...hs) > 1)
    add('shell-shift', 'shell', 'header/department tabs differ between modules', { viewport: w, screen: 'all modules', dataset: 'stress', variant: 'default' },
      { heights, tabX });
}

const list = [...issues.values()].map((i) => {
  const mobileOnly = [...i.widths].every((w) => MOBILE.has(w));
  const score = (WEIGHT[i.kind] || 20) * Math.log2(1 + i.screens.size) * Math.log2(1 + i.widths.size);
  return { ...i, widths: [...i.widths].sort((a, b) => parseInt(a) - parseInt(b)), screens: [...i.screens].sort(), mobileOnly, score: Math.round(score) };
}).sort((a, b) => b.score - a.score);

fs.writeFileSync(path.join(dir, 'issues.json'), JSON.stringify({ shell: shellRows, issues: list }, null, 1));

const totals = {};
for (const i of list) totals[i.kind] = (totals[i.kind] || 0) + 1;
const states = results.length;
const pageOverflow = results.filter((r) => r.result && r.result.pageOverflow > 1).length;
const clsWorst = results.reduce((m, r) => Math.max(m, r.loadCls || 0, r.setupCls || 0, r.dynamic ? r.dynamic.refreshCls : 0, r.tab && r.tab.found ? r.tab.tabCls : 0), 0);
const lines = [`# Layout audit summary (${browser})`, '', `States: ${states}. Page horizontal overflow in ${pageOverflow} states. Worst CLS: ${clsWorst.toFixed(3)}.`, '',
  '| Kind | Distinct issues |', '|---|---:|', ...Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`), '',
  '## Ranked issues', '', '| # | Score | Kind | Module | Where | Widths | Screens | Example |', '|---:|---:|---|---|---|---|---|---|'];
list.slice(0, 150).forEach((i, n) => {
  const ex = i.examples[0];
  lines.push(`| ${n + 1} | ${i.score} | ${i.kind} | ${i.module} | \`${i.selector.slice(0, 90)}\` | ${i.widths.join(', ')} | ${i.screens.length}: ${i.screens.slice(0, 3).join(', ')}${i.screens.length > 3 ? ', …' : ''} | ${ex && ex.shot ? `[shot](${ex.shot})` : ''} ${ex && ex.text ? '“' + String(ex.text).slice(0, 40) + '”' : ''} |`);
});
lines.push('', '## Shell geometry per width', '', '| Width | Header height by module | Tabs move between modules |', '|---|---|---|');
for (const s of shellRows) lines.push(`| ${s.width} | ${Object.entries(s.heights).map(([m, h]) => m + ' ' + h).join(', ')} | ${s.tabsMove ? 'yes' : 'no'} |`);
fs.writeFileSync(path.join(dir, 'summary.md'), lines.join('\n') + '\n');
console.log(lines.slice(0, 20).join('\n'));
