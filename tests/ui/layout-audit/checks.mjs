// In-page layout checks. `inspect` runs inside the browser (page.evaluate), so it must stay self-contained.

export function installShiftObserver() {
  // Layout Instability API (Chromium only). Firefox and WebKit report null CLS.
  window.__auditShifts = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        const sources = (e.sources || []).map((s) => {
          const n = s.node;
          if (!n || n.nodeType !== 1) return n ? '#text' : '?';
          return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].slice(0, 3).join('.') : '');
        });
        window.__auditShifts.push({ value: e.value, at: Math.round(e.startTime), sources });
      }
    }).observe({ type: 'layout-shift', buffered: true });
    window.__auditShiftSupported = true;
  } catch {
    window.__auditShiftSupported = false;
  }
}

export function inspect(opts) {
  const { touch, maxItems = 25 } = opts;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const issues = [];
  const add = (kind, el, detail) => issues.push({ kind, selector: describe(el), text: label(el), detail });

  function describe(el) {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    for (let n = el, depth = 0; n && n.nodeType === 1 && depth < 4; n = n.parentElement, depth++) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const cls = [...n.classList].filter((c) => !/^(on|active|open|new)$/.test(c)).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      const aria = n.getAttribute('aria-label');
      if (aria && depth === 0) s += '[aria-label="' + aria.slice(0, 30) + '"]';
      parts.unshift(s);
    }
    return parts.join(' > ');
  }
  function label(el) {
    if (!el || el.nodeType !== 1) return '';
    return (el.getAttribute('aria-label') || el.innerText || el.value || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    if (el.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
    const dialog = el.closest('dialog');
    if (dialog && !dialog.open) return false;
    const details = el.parentElement && el.parentElement.closest('details:not([open])');
    if (details && !el.closest('summary')) return false;
    return true;
  }
  // The nearest ancestor that clips horizontally (an own scroller or overflow:hidden box).
  function clipper(el) {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const o = getComputedStyle(n).overflowX;
      if (o !== 'visible') return n;
    }
    return null;
  }
  // Elements in a modal dialog live in the top layer; everything else is "under" it.
  const modal = [...document.querySelectorAll('dialog[open]')].find((d) => d.matches(':modal'));
  const scope = modal || document.body;
  // Popovers the state opened on purpose (bell, user menu, dialogs, drawer) may cover the page; only
  // collisions inside one layer, or with something not opened on purpose, count.
  // The floating New opportunity button and an opened Also today panel float above the page on purpose.
  const OVERLAYS = '.bell-panel, .user-menu-panel, dialog[open], .crm-drawer, .app-primary, .rail.sales-rail-open, .rail.design-rail-open';
  const layer = (el) => (el && el.closest ? el.closest(OVERLAYS) : null);
  const crossesOverlay = (a, b) => layer(a) !== layer(b) && (layer(a) || layer(b));
  // Content scrolled under the sticky header is hidden by design, not by a layout fault.
  const underHeader = (a, b) => !!a.closest('.app-header') !== !!b.closest('.app-header');

  // 1. Horizontal page overflow and its widest causes.
  const docW = document.documentElement.scrollWidth;
  const pageOverflow = Math.max(0, docW - vw);
  if (pageOverflow > 1) {
    const offenders = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && visible(el) && !clipper(el)) offenders.push([r.right - vw, el]);
    }
    offenders.sort((a, b) => b[0] - a[0]);
    // Keep the outermost offenders only, so one wide table is one finding.
    const kept = [];
    for (const [px, el] of offenders) {
      if (kept.some(([, k]) => k.contains(el))) continue;
      kept.push([px, el]);
      if (kept.length >= 5) break;
    }
    for (const [px, el] of kept) add('page-overflow', el, { overflowPx: Math.round(px) });
    if (!kept.length) issues.push({ kind: 'page-overflow', selector: 'document', text: '', detail: { overflowPx: pageOverflow } });
  }

  const interactiveSel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [tabindex]:not([tabindex="-1"])';
  const interactive = [...scope.querySelectorAll(interactiveSel)].filter(visible);

  // 2. Interactive elements cut off at the viewport edge (and not inside a scroller that can reveal them).
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if ((r.left < -1 || r.right > vw + 1) && !clipper(el)) add('off-screen', el, { left: Math.round(r.left), right: Math.round(r.right), vw });
  }

  // 3. Obscured controls: something else is painted over the centre of an in-view control (z-index conflicts, overlaps).
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
    // Only judge controls that are not themselves clipped away by a scroller.
    const c = clipper(el);
    if (c) {
      const cr = c.getBoundingClientRect();
      if (x < cr.left || x > cr.right || y < cr.top || y > cr.bottom) continue;
    }
    const hit = document.elementFromPoint(x, y);
    if (!hit || el.contains(hit) || hit.contains(el)) continue;
    if (hit.closest('label') && hit.closest('label').contains(el)) continue;
    if (el.closest('label') && el.closest('label').contains(hit)) continue;
    if (crossesOverlay(el, hit) || underHeader(el, hit)) continue;
    add('obscured', el, { by: describe(hit), byText: label(hit) });
  }

  // 4. Overlapping text: text-bearing leaves whose boxes intersect though neither contains the other.
  // Range rects report the full text even where an ancestor clips it (ellipsis, scrollers), so cut them to what is painted.
  function paintedBox(el, r) {
    let { left, top, right, bottom } = r;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = n.getBoundingClientRect();
      left = Math.max(left, c.left); right = Math.min(right, c.right);
      top = Math.max(top, c.top); bottom = Math.min(bottom, c.bottom);
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  const leaves = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.nodeValue.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || /^(SCRIPT|STYLE|OPTION|TITLE)$/.test(el.tagName)) continue;
    seen.add(el);
    if (!visible(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    for (const raw of range.getClientRects()) {
      const r = paintedBox(el, raw);
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh * 3) continue;
      leaves.push({ el, r });
    }
  }
  const cell = 80, grid = new Map();
  leaves.forEach((l, i) => {
    for (let gx = Math.floor(l.r.left / cell); gx <= Math.floor(l.r.right / cell); gx++)
      for (let gy = Math.floor(l.r.top / cell); gy <= Math.floor(l.r.bottom / cell); gy++) {
        const k = gx + ',' + gy;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  });
  const pairs = new Set();
  for (const ids of grid.values()) {
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const A = leaves[ids[a]], B = leaves[ids[b]];
      if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (crossesOverlay(A.el, B.el) || underHeader(A.el, B.el)) continue;
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w < 3 || h < 3) continue;
      // A clipped text box overlapping its neighbour only counts if both are actually painted there.
      const key = ids[a] < ids[b] ? ids[a] + ':' + ids[b] : ids[b] + ':' + ids[a];
      if (pairs.has(key)) continue;
      pairs.add(key);
      add('overlap', A.el, { with: describe(B.el), withText: label(B.el), w: Math.round(w), h: Math.round(h) });
    }
  }

  // 5. Clipped text: content wider/taller than its box with overflow hidden and no ellipsis.
  for (const el of scope.querySelectorAll('*')) {
    if (!el.firstChild || !visible(el)) continue;
    if (/^(INPUT|SELECT|TEXTAREA|svg|IMG|CANVAS|VIDEO|DIALOG|HTML|BODY)$/i.test(el.tagName)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!hasText) continue;
    // Visually hidden labels (sr-only) are 1 px boxes on purpose.
    if (el.clientWidth <= 2 || el.clientHeight <= 2) continue;
    const cs = getComputedStyle(el);
    const clipsX = cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
    const clipsY = (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 2;
    if (!clipsX && !clipsY) continue;
    if (/auto|scroll/.test(cs.overflowX) && clipsX && !clipsY) continue; // scrolls, not clipped
    const ellipsis = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp;
    if (ellipsis) {
      if (!el.title && !el.closest('[title]')) add('truncated-no-tooltip', el, {});
      continue;
    }
    add('clipped-text', el, { scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight });
  }

  // 5b. Squeezed scroll areas: a list whose own scroller has been crushed by a fixed-height layout, so its
  //     rows exist but cannot be seen (the page itself does not scroll to make room).
  for (const el of scope.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !/auto|scroll|hidden/.test(cs.overflowY)) continue;
    if (el.clientWidth < 100 || el.scrollHeight < 60) continue;
    const squeezed = el.clientHeight < Math.min(120, vh * 0.2) && el.scrollHeight > el.clientHeight + 40;
    if (!squeezed || !el.querySelector(interactiveSel)) continue;
    if (el.closest('details:not([open])') || (el.closest('dialog') && !el.closest('dialog').open)) continue;
    // Report the outermost squeezed box only.
    let outer = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ncs = getComputedStyle(n);
      if (/auto|scroll|hidden/.test(ncs.overflowY) && n.clientHeight < Math.min(120, vh * 0.2) && n.scrollHeight > n.clientHeight + 40 && n.clientWidth >= 100) { outer = true; break; }
    }
    if (!outer) add('squeezed-scroll-area', el, { clientH: el.clientHeight, scrollH: el.scrollHeight, overflowY: cs.overflowY });
  }

  // 6. Touch targets below 44 x 44 CSS px (WCAG 2.5.5 AAA / Apple HIG); inline links inside running text are exempt.
  if (touch) {
    for (const el of interactive) {
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /^(P|LI|SPAN)$/.test(el.parentElement.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        if (r.bottom < 0 || r.top > vh * 3) continue;
        add('touch-target', el, { w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  }

  // Group identical findings (same kind + selector) and cap per kind.
  const grouped = new Map();
  for (const i of issues) {
    const k = i.kind + '|' + i.selector;
    if (!grouped.has(k)) grouped.set(k, { ...i, count: 0 });
    grouped.get(k).count++;
  }
  const byKind = {};
  for (const g of grouped.values()) (byKind[g.kind] ||= []).push(g);
  for (const k of Object.keys(byKind)) byKind[k] = byKind[k].sort((a, b) => b.count - a.count).slice(0, maxItems);
  const counts = {};
  for (const i of issues) counts[i.kind] = (counts[i.kind] || 0) + 1;

  return {
    vw, vh, docW, pageOverflow,
    scrollbar: window.innerWidth - document.documentElement.clientWidth,
    modal: !!modal,
    counts, findings: byKind,
  };
}

export function takeShifts() {
  const s = window.__auditShifts || [];
  window.__auditShifts = [];
  return { supported: window.__auditShiftSupported, total: s.reduce((a, e) => a + e.value, 0), entries: s.slice(0, 10) };
}
