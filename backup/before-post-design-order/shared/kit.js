// Small building blocks every screen uses: make an element, a dropdown, a money box, save data.
(function () {
  const Kit = {};

  Kit.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const key in attrs || {}) {
      const v = attrs[key];
      if (v == null || v === false) continue;
      if (key === 'class') el.className = v;
      else if (key === 'style') el.style.cssText = v;
      else if (key.slice(0, 2) === 'on') el.addEventListener(key.slice(2), v);
      else if (key === 'value') el.value = v;
      else if (key === 'checked' || key === 'disabled') el[key] = !!v;
      else el.setAttribute(key, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach(function (kid) {
      if (kid == null || kid === false) return;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
    return el;
  };
  const h = Kit.h;

  // Money, always with Indian commas.
  Kit.num = function (text) {
    const n = Number(String(text == null ? '' : text).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  Kit.commas = function (n) { return Math.round(Number(n) || 0).toLocaleString('en-IN'); };
  Kit.money = function (n) { return '₹' + Kit.commas(n); };
  // A plain number of lakhs, always two decimal places, cut not rounded: 1,69,42,760 shows as 169.42
  Kit.lakh = function (n) { return (Math.floor((Number(n) || 0) / 1000) / 100).toFixed(2); };
  // Money for every summary and dashboard: ₹169.42 L. The exact rupees stay on the client's own order screens.
  Kit.short = function (n) { return '₹' + Kit.lakh(n) + ' L'; };

  // Dates.
  Kit.now = function () { return new Date().toISOString(); };
  Kit.today = function () { return Kit.ymd(new Date()); };
  Kit.ymd = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  Kit.addDays = function (ymd, days) {
    const d = new Date(ymd + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return Kit.ymd(d);
  };
  Kit.day = function (iso) {
    if (!iso) return 'Not set';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  Kit.dayTime = function (iso) {
    if (!iso) return 'Not set';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  };
  // The bank-only view (online, second password): only money that goes through the bank is shown.
  Kit.bankOnly = function () { return !!window.CRM_BANK_ONLY; };
  // A follow-up can carry a time as well as a date. Shown with the time when it has one.
  Kit.when = function (v) { return !v ? 'Not set' : (v.length > 10 ? Kit.dayTime(v) : Kit.day(v)); };
  // What a call result is called on screen. The saved value stays the same, so old records keep working.
  const OUTCOME = { 'No answer': 'RNR · ring, no response', 'Asked to call later': 'Rescheduled for later' };
  Kit.outcome = function (v) { return OUTCOME[v] || v; };
  Kit.outcomes = function (list) { return list.map(function (v) { return [v, Kit.outcome(v)]; }); };
  Kit.hoursSince = function (iso) { return (Date.now() - new Date(iso).getTime()) / 3600000; };
  Kit.daysSince = function (iso) { return iso ? Math.floor(Kit.hoursSince(iso) / 24) : 0; };
  Kit.span = function (hours) {
    const n = Math.abs(hours);
    if (n < 1) return Math.max(1, Math.round(n * 60)) + ' min';
    if (n < 48) return Math.round(n) + 'h';
    return Math.round(n / 24) + ' days';
  };

  // Pieces.
  Kit.pill = function (text, tone) { return h('span', { class: 'pill ' + (tone || 'grey') }, text); };
  Kit.btn = function (text, onClick, kind, extra) {
    return h('button', Object.assign({ type: 'button', class: 'btn ' + (kind || ''), onclick: onClick }, extra || {}), text);
  };
  Kit.select = function (options, value, onChange, opt) {
    opt = opt || {};
    const el = h('select', { 'aria-label': opt.label, onchange: function () { onChange(el.value); } });
    if (opt.placeholder !== false) el.append(h('option', { value: '' }, opt.placeholder || 'Choose'));
    options.forEach(function (o) {
      const pair = Array.isArray(o) ? o : [o, o];
      el.append(h('option', { value: pair[0] }, pair[1]));
    });
    el.value = value == null ? '' : String(value);
    return el;
  };
  Kit.input = function (value, onChange, opt) {
    opt = opt || {};
    const el = h('input', {
      type: opt.type || 'text', placeholder: opt.placeholder, 'aria-label': opt.label,
      class: opt.money ? 'right num' : '', inputmode: opt.money ? 'numeric' : null, style: opt.style
    });
    el.value = opt.money ? (value ? Kit.commas(value) : '') : (value == null ? '' : value);
    // Money boxes put the Indian commas in while you type, not only after you leave the box.
    if (opt.money) el.addEventListener('input', function () {
      const digitsBefore = el.value.slice(0, el.selectionStart).replace(/[^0-9]/g, '').length;
      const digits = el.value.replace(/[^0-9]/g, '');
      el.value = digits ? Number(digits).toLocaleString('en-IN') : '';
      let pos = 0, seen = 0;
      while (pos < el.value.length && seen < digitsBefore) { if (/[0-9]/.test(el.value[pos])) seen++; pos++; }
      el.setSelectionRange(pos, pos);
    });
    // Save when the person leaves the box or presses Enter. The browser's own "change" signal is not relied on,
    // because it does not fire in a money box once the commas have been rewritten while typing.
    let saved = el.value;
    el.addEventListener('input', function () { el.setAttribute('data-dirty', '1'); });
    const commit = function () {
      el.removeAttribute('data-dirty');
      if (el.value === saved) return;
      saved = el.value;
      onChange(opt.money ? Kit.num(el.value) : el.value);
    };
    el.addEventListener('change', commit);
    el.addEventListener('blur', commit);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
    return el;
  };
  // A row of buttons where exactly one is chosen (used for yes / no answers).
  Kit.choice = function (options, value, onChange, label) {
    return h('div', { class: 'choice', role: 'group', 'aria-label': label }, options.map(function (o) {
      const v = Array.isArray(o) ? o[0] : o, text = Array.isArray(o) ? o[1] : o;
      return h('button', { type: 'button', class: (/^yes$/i.test(text) ? 'yes ' : (/^no$/i.test(text) ? 'no ' : '')) + (v === value ? 'on' : ''), 'aria-pressed': v === value ? 'true' : 'false', onclick: function () { onChange(v === value ? '' : v); } }, text);
    }));
  };
  Kit.field = function (label, control) { return h('label', { class: 'field' }, h('span', null, label), control); };
  Kit.card = function (title, meta, tone, ...body) {
    return h('section', { class: 'card' },
      h('div', { class: 'card-h t-' + tone }, h('h2', null, title), h('span', null, meta || '')),
      h('div', { class: 'card-b' }, body));
  };
  Kit.upload = function (label, current, onFile) {
    const pick = h('input', { type: 'file', style: 'display:none', onchange: function () { if (pick.files[0]) onFile(pick.files[0]); } });
    return h('span', { class: 'flexrow' },
      current ? Kit.pill('Uploaded', 'green') : null,
      Kit.btn(current ? 'Replace' : (label || 'Upload'), function () { pick.click(); }, 'small'), pick);
  };

  // Saved data. One file on this laptop, written by the engine.
  let timer = null;
  let busy = false;
  let again = false;
  let waiting = false;
  let base = {};
  let redraw = null;
  const redraws = [];
  // What each client looked like the last time this page and the saved file agreed.
  function remember() {
    base = {};
    (Kit.store.data.clients || []).forEach(function (c) { base[c.id] = JSON.stringify(c); });
  }
  // Save. If another screen saved first, nothing is thrown away: this page's changed clients are laid over
  // the newer copy and it is saved again. Two screens only clash if they change the same client at the same moment.
  function send(tries) {
    return fetch('/api/store', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Kit.store.data) })
      .then(function (r) {
        if (r.status !== 409) return r.json().then(function (out) { if (out && out.rev != null) Kit.store.data.rev = out.rev; remember(); });
        if (tries >= 4) return null;
        return fetch('/api/store').then(function (x) { return x.json(); }).then(function (latest) {
          const mine = Kit.store.data;
          const at = {};
          latest.clients.forEach(function (c, i) { at[c.id] = i; });
          mine.clients.forEach(function (c) {
            if (base[c.id] === JSON.stringify(c)) return;
            if (at[c.id] != null) { latest.clients[at[c.id]] = c; return; }
            // A client added here while another screen was adding one too: let the rules give it numbers of its own.
            if (Kit.store.onAdd) Kit.store.onAdd(c, latest.clients);
            latest.clients.push(c);
          });
          if (mine.seen) latest.seen = Object.assign({}, latest.seen || {}, mine.seen);
          if (mine.people) latest.people = Object.assign({}, latest.people || {}, mine.people);
          if (mine.architects) latest.architects = mine.architects;
          Kit.store.data = latest;
          if (redraw) redraw();
          return send(tries + 1);
        });
      });
  }
  function push() {
    if (busy) { again = true; return; }
    busy = true;
    send(0).catch(function () {}).then(function () { busy = false; if (again) { again = false; push(); } else waiting = false; });
  }
  Kit.store = {
    data: null,
    load: function () {
      return fetch('/api/store').then(function (r) { return r.json(); }).then(function (data) {
        Kit.store.data = data;
        remember();
        return data;
      });
    },
    save: function () {
      waiting = true;
      clearTimeout(timer);
      timer = setTimeout(push, 150);
    },
    // Pick up what other screens saved, without a refresh. Skipped only while the person is in the middle of
    // something (typing, a dropdown open, a click half done) or a save is on its way.
    watch: function (onChange) {
      redraws.push(onChange);
      redraw = function () { redraws.forEach(function (fn) { fn(); }); };
      setInterval(function () {
        if (busy || waiting || Kit.busy()) return;
        fetch('/api/store').then(function (r) { return r.json(); }).then(function (data) {
          if (busy || waiting || Kit.busy() || (data.rev || 0) === (Kit.store.data.rev || 0)) return;
          Kit.store.data = data;
          remember();
          onChange();
        });
      }, 4000);
    },
    // A file that did not reach the laptop must never be shown as uploaded: say so, and stop there.
    sendFile: function (owner, file) {
      const stop = function (why) { window.alert(why); return new Promise(function () {}); };
      if (file.size > 25 * 1024 * 1024) return stop('This file is larger than 25 MB, so it was not uploaded.');
      return fetch('/api/upload/' + encodeURIComponent(owner) + '/' + encodeURIComponent(file.name), { method: 'PUT', body: file })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (out) { return out && out.name ? out.name : stop('The file could not be uploaded. Please try again.'); },
          function () { return stop('The file could not be uploaded. Please try again.'); });
    }
  };

  // A list: name, one quiet line under it, one coloured tag on the right.
  // With `bulk`, a bin icon sits in the header: click it, tick rows, and delete them together.
  const ticking = {};
  const BIN_ICON = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
  Kit.list = function (title, tools, items, empty, bulk) {
    const picked = bulk ? ticking[title] : null;
    const ids = picked ? Object.keys(picked).filter(function (id) { return items.some(function (it) { return it.id === id; }); }) : [];
    let side = tools || null;
    if (bulk && !picked) {
      const bin = h('button', { type: 'button', class: 'btn round', 'aria-label': 'Select and delete', title: 'Select and delete', onclick: function () { ticking[title] = {}; bulk.redraw(); } });
      bin.innerHTML = BIN_ICON;
      side = h('div', { class: 'flexrow' }, tools || null, bin);
    }
    if (picked) {
      side = h('div', { class: 'flexrow' },
        Kit.btn(ids.length === items.length && items.length ? 'Untick all' : 'Tick all', function () {
          const all = ids.length === items.length; ticking[title] = {};
          if (!all) items.forEach(function (it) { ticking[title][it.id] = true; });
          bulk.redraw();
        }, 'small'),
        Kit.btn('Delete ' + ids.length, function () { delete ticking[title]; bulk.remove(ids); }, 'small warn', { disabled: !ids.length }),
        Kit.btn('Cancel', function () { delete ticking[title]; bulk.redraw(); }, 'small'));
    }
    return h('section', { class: 'card list' },
      h('div', { class: 'list-h' }, h('h1', null, title, h('span', { class: 'count' }, items.length)), side),
      h('div', { class: 'rows', 'data-keep': title },
        items.length ? items.map(function (it) {
          const on = picked && picked[it.id];
          return h('button', { type: 'button', class: 'mini' + (it.on || on ? ' on' : '') + (it.mark ? ' mark-' + it.mark : ''), 'aria-pressed': picked ? (on ? 'true' : 'false') : null,
            onclick: picked ? function () { if (on) delete picked[it.id]; else picked[it.id] = true; bulk.redraw(); } : it.pick },
            picked ? h('span', { class: 'tick' + (on ? ' yes' : '') }, on ? '✓' : '') : null,
            h('span', { class: 'who' }, h('b', null, it.priority ? h('i', { class: 'heat ' + it.priority.toLowerCase() }, it.priority) : null, it.name), h('small', null, it.sub)), it.pill);
        }) : h('div', { class: 'empty' }, empty)));
  };

  // A link that opens an uploaded file.
  Kit.fileLink = function (owner, name, label) {
    if (!name) return null;
    return h('a', { href: '/data/uploads/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name), target: '_blank', rel: 'noopener' }, label || name);
  };

  // A short note on a client that another team's action leaves behind ("Accounts confirmed the token").
  // `from` is the team whose action it was: Sales, Design, Accounts, Measurement (later also Installation and PDI).
  Kit.news = function (c, text, tone, from) {
    c.news = c.news || [];
    c.news.unshift({ at: Kit.now(), text: text, tone: tone || 'green', from: from || '' });
    c.news = c.news.slice(0, 20);
  };

  // The overview screen belongs to the head of sales, so it carries her name instead of the word "Management".
  Kit.headName = function () { const p = window.People && People.list[0]; return p ? p.name : 'Management'; };
  // On the online copy every department lives in one page. Only the one on show draws itself; the others stay quiet
  // until they are shown again. On the laptop each department is its own page, so there is only ever one.
  Kit.apps = {};
  Kit.activeApp = '';
  Kit.register = function (id, show) { Kit.apps[id] = show; Kit.activeApp = id; };
  Kit.showing = function (id) { return Kit.activeApp === id; };

  // Kit.pdf(filename, title, subtitle, sections): one tidy PDF. A section is { heading, rows: [[label, value], ...] }.
  // Needs shared/vendor/jspdf.umd.min.js on the page. Amounts print as "Rs" because the PDF's own font has no rupee sign.
  Kit.pdf = function (filename, title, subtitle, sections) {
    if (!window.jspdf) return;
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const clean = function (v) { return String(v == null || v === '' ? '-' : v).replace(/₹\s?/g, 'Rs ').replace(/·/g, '-').replace(/→/g, 'to').replace(/[^\x20-\x7E]/g, ''); };
    const left = 44, right = 551, labelW = 170;
    let y = 56;
    const room = function (need) { if (y + need > 790) { doc.addPage(); y = 56; } };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(clean(title), left, y); y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110);
    doc.splitTextToSize(clean(subtitle), right - left).forEach(function (line) { doc.text(line, left, y); y += 12; });
    y += 6;
    sections.forEach(function (s) {
      if (!s || !s.rows || !s.rows.length) return;
      room(40);
      doc.setDrawColor(215); doc.line(left, y, right, y); y += 16;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(20); doc.text(clean(s.heading), left, y); y += 15;
      doc.setFontSize(9.5);
      s.rows.forEach(function (r) {
        const lines = doc.splitTextToSize(clean(r[1]), right - left - labelW);
        room(lines.length * 12 + 2);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(110); doc.text(clean(r[0]), left, y);
        doc.setTextColor(20); doc.text(lines, left + labelW, y);
        y += lines.length * 12 + 3;
      });
      y += 6;
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text('MAGPPIE CRM - made ' + clean(Kit.dayTime(Kit.now())) + ' - page ' + i + ' of ' + pages, left, 822); }
    // On the online copy the page has to ask the viewer before a file is saved. On the laptop it just saves.
    if (!(window.claude && window.claude.use)) return doc.save(filename);
    window.claude.use('downloads').then(function (d) { return d ? d.save({ filename: filename, data: doc.output('blob') }) : doc.save(filename); }).catch(function () {});
  };

  // Links between the departments, shown in every top bar.
  Kit.depts = function (current) {
    return h('nav', { class: 'depts', 'aria-label': 'Departments' }, [['sales', 'Sales'], ['design', 'Design'], ['measurement', 'Measurement'], ['accounts', 'Accounts'], ['management', Kit.headName()]].map(function (d) {
      return h('a', { href: '/' + d[0] + '/', class: d[0] === current ? 'on' : '' }, d[1]);
    }));
  };

  // ---- Redrawing without getting in the person's way ----
  // A screen is redrawn whole after every change. Done at the wrong moment that swallows a click
  // (the button is replaced between press and release), drops the cursor out of the next box,
  // or shuts a dropdown that has just opened. Two helpers prevent all three.
  let mouseIsDown = false;
  const waiters = [];
  document.addEventListener('mousedown', function () { mouseIsDown = true; }, true);
  document.addEventListener('mouseup', function () { setTimeout(function () { mouseIsDown = false; waiters.forEach(function (w) { w(); }); }, 0); }, true);
  window.addEventListener('blur', function () { mouseIsDown = false; });
  // A dropdown counts as open from the moment it is pressed until something is picked, it loses the cursor,
  // or 20 seconds pass. A box left with the cursor in it must not stop the screen from updating for ever.
  const SELECT_OPEN_FOR = 20000;
  let openSelect = null;
  let openSelectAt = 0;
  let lastKeyAt = 0;
  function selectBusy() { return !!openSelect && document.activeElement === openSelect && Date.now() - openSelectAt < SELECT_OPEN_FOR; }
  document.addEventListener('mousedown', function (e) {
    if (e.target && e.target.tagName === 'SELECT') { openSelect = e.target; openSelectAt = Date.now(); } else openSelect = null;
  }, true);
  document.addEventListener('keydown', function (e) {
    lastKeyAt = Date.now();
    if (e.target && e.target.tagName === 'SELECT' && [' ', 'Enter', 'ArrowDown', 'ArrowUp'].indexOf(e.key) >= 0) { openSelect = e.target; openSelectAt = Date.now(); }
  }, true);
  document.addEventListener('focusout', function (e) { if (e.target === openSelect) openSelect = null; }, true);
  document.addEventListener('change', function (e) {
    // Picking from a dropdown ends the press: the dropdown's own menu swallows the mouse release.
    if (e.target && e.target.tagName === 'SELECT') { mouseIsDown = false; openSelect = null; }
  }, true);
  // Is the person in the middle of something a redraw would spoil?
  Kit.busy = function () {
    if (mouseIsDown) return true;
    const el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'SELECT') return selectBusy();
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return false;
    return el.hasAttribute('data-dirty') || Date.now() - lastKeyAt < 5000;
  };

  // Kit.warn(draft): the warning a form wants to show, shown once. It goes away as soon as the person
  // changes anything in that form, so an old warning never sits next to a field that is now right.
  Kit.warn = function (d, tag) {
    if (!d || !d.msg) return null;
    const text = d.msg;
    d.msg = '';
    return Kit.h(tag || 'div', { class: 'msg', 'data-once': '1' }, text);
  };
  function clearWarnings(e) {
    const box = e.target && e.target.closest ? e.target.closest('.card, .soft, .sheet, .sheet-b') : null;
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.msg[data-once]'), function (m) { m.remove(); });
  }
  document.addEventListener('input', clearWarnings, true);
  document.addEventListener('change', clearWarnings, true);

  // Kit.calm(redraw) gives back a "redraw soon" function: never between pressing and releasing the mouse,
  // and never while a dropdown the person has just opened may still be open.
  Kit.calm = function (redraw) {
    let queued = false;
    let parked = false;
    function attempt() {
      if (!queued || mouseIsDown || parked) return;
      if (selectBusy()) {
        parked = true;
        const el = openSelect;
        let wake = null;
        const resume = function () { el.removeEventListener('change', resume); el.removeEventListener('blur', resume); clearTimeout(wake); parked = false; setTimeout(attempt, 0); };
        el.addEventListener('change', resume);
        el.addEventListener('blur', resume);
        wake = setTimeout(resume, SELECT_OPEN_FOR - (Date.now() - openSelectAt) + 50);
        return;
      }
      queued = false;
      redraw();
    }
    waiters.push(attempt);
    return function () {
      queued = true;
      setTimeout(attempt, 0);
      // If the mouse was released outside the window, do not wait for ever.
      setTimeout(function () { if (queued && mouseIsDown) { mouseIsDown = false; attempt(); } }, 2000);
    };
  };

  // Kit.keepFocus(root, redraw): redraw, then put the cursor back in the same box it was in.
  const FOCUSABLE = 'input, select, textarea, button, a[href]';
  function nameOf(el) {
    const wrap = el.closest ? el.closest('label.field') : null;
    return el.getAttribute('aria-label') || el.getAttribute('placeholder') || (wrap && wrap.querySelector('span') ? wrap.querySelector('span').textContent : '') || (el.tagName === 'BUTTON' ? el.textContent.trim().slice(0, 40) : '');
  }
  Kit.keepFocus = function (root, redraw) {
    const el = document.activeElement;
    let mark = null;
    if (el && el !== document.body && root.contains(el)) {
      const before = Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE));
      mark = { i: before.indexOf(el), tag: el.tagName, type: el.type || '', name: nameOf(el), start: null, end: null };
      try { mark.start = el.selectionStart; mark.end = el.selectionEnd; } catch (e) { /* this kind of box has no cursor position */ }
    }
    redraw();
    if (!mark) return;
    const after = Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE));
    const same = function (x) { return x && x.tagName === mark.tag && (x.type || '') === mark.type && nameOf(x) === mark.name; };
    let target = same(after[mark.i]) ? after[mark.i] : null;
    if (!target) { const hits = after.filter(same); if (hits.length === 1) target = hits[0]; }
    if (!target || target.disabled) return;
    target.focus({ preventScroll: true });
    if (mark.start != null && /^(text|search|tel|url|password)$/.test(target.type || '')) {
      try { target.setSelectionRange(mark.start, mark.end); } catch (e) { /* ignore */ }
    }
  };

  // Keep the screen at the design size and fit it to the window.
  Kit.fit = function () {
    const app = document.getElementById('app');
    const scale = Math.min(window.innerWidth / 1440, 1.4);
    app.style.zoom = scale;
    app.style.height = (window.innerHeight / scale) + 'px';
  };

  // A small one-screen app: a top bar, a main area, and a window that opens from the bottom.
  // Used by the departments that have one simple screen.
  // The slim strip on the left that opens wide when the mouse rests on it for three seconds, or on a click.
  let navOpen = false;
  let navTimer = null;
  let navWatched = false;
  function watchNav() {
    if (navWatched) return;
    navWatched = true;
    document.addEventListener('mousemove', function (e) {
      const inside = e.target.closest && e.target.closest('.nav');
      if (inside) {
        if (!navOpen && !navTimer) navTimer = setTimeout(function () { navTimer = null; navOpen = true; const el = document.querySelector('.nav'); if (el) el.classList.add('open'); }, 3000);
        return;
      }
      clearTimeout(navTimer); navTimer = null;
      if (navOpen) { navOpen = false; const el = document.querySelector('.nav'); if (el) el.classList.remove('open'); }
    });
    document.addEventListener('click', function (e) {
      const el = e.target.closest && e.target.closest('.nav');
      if (!el || navOpen) return;
      e.preventDefault(); e.stopPropagation();
      clearTimeout(navTimer); navTimer = null;
      navOpen = true; el.classList.add('open');
    }, true);
  }

  // Which team a notice came from. Older notices carry no name, so it is read from their wording.
  Kit.newsFrom = function (n) { return n.from || (/accounts/i.test(n.text) ? 'Accounts' : (/design|proposal/i.test(n.text) ? 'Design' : 'Sales')); };
  const BELL = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9"></path><path d="M10 20a2 2 0 0 0 4 0"></path></svg>';
  // The bell of a department screen: one column per team it hears from. Opening it marks everything as seen.
  //   who:     the department's own id, used to remember what it has seen
  //   sources: the teams it hears from, in column order
  function bell(who, sources, all, view, redraw, save) {
    const seenAt = ((Kit.store.data.seen || {})[who] || {}).at || '';
    const cols = sources.map(function (src) { return { src: src, items: [] }; });
    all.forEach(function (c) {
      if (c.stage === 'bin' || c.stage === 'lost') return;
      (c.news || []).forEach(function (n) {
        const col = cols.filter(function (x) { return x.src === Kit.newsFrom(n); })[0];
        if (col) col.items.push({ c: c, n: n, unread: n.at > seenAt });
      });
    });
    cols.forEach(function (col) { col.items.sort(function (a, b) { return a.n.at < b.n.at ? 1 : -1; }); });
    const unread = cols.reduce(function (t, col) { return t + col.items.filter(function (x) { return x.unread; }).length; }, 0);
    const when = function (iso) { const hrs = Kit.hoursSince(iso), mins = Math.floor(hrs * 60); return mins < 2 ? 'just now' : (hrs < 1 ? mins + ' min ago' : (hrs < 24 ? Math.floor(hrs) + 'h ago' : Kit.day(iso).replace(/ \d{4}$/, ''))); };
    const btn = h('button', { type: 'button', class: 'btn round bell', 'aria-label': 'Notifications, ' + unread + ' new', 'aria-expanded': view.bell ? 'true' : 'false', onclick: function () {
      view.bell = !view.bell;
      if (view.bell) { view.fresh = seenAt; if (unread) { save(function () { const d = Kit.store.data; d.seen = d.seen || {}; d.seen[who] = { at: Kit.now() }; }); return; } }
      redraw();
    } });
    btn.innerHTML = BELL;
    if (unread && !view.bell) btn.append(h('span', { class: 'badge' }, unread > 99 ? '99+' : unread));
    const panel = !view.bell ? null : h('div', { class: 'bell-panel', role: 'dialog', 'aria-label': 'Notifications', style: 'grid-template-columns: repeat(' + cols.length + ', minmax(0, 1fr)); width: ' + Math.min(1100, 250 * cols.length) + 'px' },
      cols.map(function (col) {
        return h('div', { class: 'bell-col' },
          h('div', { class: 'note-h' }, h('b', null, 'From ' + col.src), h('span', null, col.items.length || '')),
          col.items.length ? col.items.slice(0, 30).map(function (x) {
            return h('div', { class: 'note' + (x.n.at > (view.fresh || '') ? ' new' : '') }, h('span', { class: 'who' }, h('b', null, x.c.name), h('small', null, x.n.text)), h('span', { class: 'sub' }, when(x.n.at)));
          }) : h('div', { class: 'note-empty' }, 'Nothing from ' + col.src + ' yet.'));
      }));
    return h('div', { class: 'bell-wrap' }, btn, panel);
  }

  // A department screen. It can have slim stage tabs across the top (o.tabs) and, under each tab,
  // its own strip of pages on the left (o.pages). Both are optional; with neither it is one plain screen.
  //   o.tabs(all)        -> [{ id, label, count }]
  //   o.pages(tab, all)  -> [{ id, title, short, count, summary }]
  //   o.build(ctx)       -> { main, window }      ctx.tab and ctx.page say where the person is
  Kit.app = function (o) {
    const root = document.getElementById('app');
    const state = { open: null, fresh: false, tab: '', page: '' };
    function place() { location.hash = state.tab + (state.page ? '/' + state.page : ''); }
    function render() {
      if (!Kit.showing(o.id)) return;
      Kit.fit();
      const keep = {};
      root.querySelectorAll('[data-keep]').forEach(function (el) { keep[el.getAttribute('data-keep')] = el.scrollTop; });
      const all = Kit.store.data.clients;
      all.forEach(SalesLogic.ensure);
      const tabs = o.tabs ? o.tabs(all) : [];
      if (tabs.length && !tabs.some(function (t) { return t.id === state.tab; })) state.tab = tabs[0].id;
      const pages = o.pages ? o.pages(state.tab, all) : [];
      if (pages.length && !pages.some(function (p) { return p.id === state.page; })) state.page = pages[0].id;
      const ctx = {
        all: all, open: state.open, tab: state.tab, page: state.page,
        go: function (tab, page) { state.tab = tab; state.page = page || ''; state.open = null; place(); render(); },
        show: function (what) { state.open = what; state.fresh = true; render(); },
        close: function () { state.open = null; render(); },
        // A change is saved; a plain redraw (opening a section, showing a message) is not.
        update: function (change) { if (change) { change(); Kit.store.save(); } later(); }
      };
      const built = o.build(ctx);
      const win = built.window ? [
        h('div', { class: 'veil', onclick: ctx.close }),
        h('div', { class: 'sheet' + (state.fresh ? ' rise' : ''), role: 'dialog', 'aria-label': built.window.title },
          h('div', { class: 'sheet-h' },
            h('div', null, h('div', { class: 'flexrow' }, h('h2', null, built.window.title), built.window.tag || null),
              h('div', { class: 'sub', style: 'font-size: 13px; margin-top: 4px' }, built.window.sub || '')),
            Kit.btn('Close', ctx.close, 'small')),
          h('div', { class: 'sheet-b', 'data-keep': 'sheet' }, built.window.body))] : [];
      state.fresh = false;
      Kit.keepFocus(root, function () {
        root.replaceChildren(
          h('header', { class: 'top' }, h('div', { class: 'flexrow' }, h('div', { class: 'brand' }, 'MAGPPIE ', h('span', null, o.title)), Kit.depts(o.id)),
            h('div', { class: 'flexrow' }, o.tools ? o.tools(ctx) : null, o.hears ? bell(o.id, o.hears, all, state, later, ctx.update) : null)),
          tabs.length ? h('div', { class: 'stagebar', role: 'tablist', 'aria-label': o.title + ' stages' }, tabs.map(function (t) {
            return h('button', { type: 'button', role: 'tab', class: t.id === state.tab ? 'on' : '', 'aria-selected': t.id === state.tab ? 'true' : 'false', onclick: function () { ctx.go(t.id, ''); } },
              h('span', null, t.label), t.count == null ? null : h('b', { class: 'num' }, t.count));
          })) : null,
          h('div', { class: 'body' },
            pages.length ? h('nav', { class: 'nav' + (navOpen ? ' open' : ''), 'aria-label': 'Pages' }, h('div', { class: 'nav-in' }, h('div', { class: 'stages' }, pages.map(function (p) {
              return h('button', { type: 'button', class: p.id === state.page ? 'on' : '', 'aria-label': p.title + (p.count == null ? '' : ', ' + p.count), onclick: function () { ctx.go(state.tab, p.id); } },
                h('span', { class: 'slim' }, p.count == null ? null : h('b', null, p.count), h('small', p.count == null ? { style: 'font-size: 11px; font-weight: 600; padding: 6px 0' } : null, p.short || p.title)),
                h('span', { class: 'wide' }, h('span', { class: 'line' }, h('b', null, p.title), p.count == null ? null : h('b', null, p.count)), p.summary ? h('small', null, p.summary) : null));
            })))) : null,
            h('main', { class: 'main' }, built.main), built.rail ? h('aside', { class: 'rail', 'aria-label': 'Also today', 'data-keep': 'rail' }, built.rail) : null, win));
      });
      root.querySelectorAll('[data-keep]').forEach(function (el) { const top = keep[el.getAttribute('data-keep')]; if (top) el.scrollTop = top; });
    }
    const later = Kit.calm(render);
    const fromHash = function () { const parts = location.hash.replace('#', '').split('/'); state.tab = parts[0] || ''; state.page = parts[1] || ''; };
    fromHash();
    if (o.pages) watchNav();
    document.addEventListener('click', function (e) { if (state.bell && !(e.target.closest && e.target.closest('.bell-wrap'))) { state.bell = false; later(); } });
    window.addEventListener('resize', Kit.fit);
    Kit.register(o.id, function () { place(); render(); });
    window.addEventListener('hashchange', function () { if (!Kit.showing(o.id)) return; const was = state.tab + '/' + state.page; fromHash(); if (was !== state.tab + '/' + state.page) { state.open = null; render(); } });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) { state.open = null; render(); } });
    Kit.store.load().then(function () { render(); Kit.store.watch(render); });
  };

  window.Kit = Kit;
})();
