// The bridge for the online copy. The screens ask "the engine" for data exactly as they do on the laptop;
// here those questions are answered inside the page, so the screens do not change. The laptop copy never loads this file.
//
// The client data travels inside the page, locked. It can only be opened with the password, which is not
// written anywhere in this page. What a person changes is kept, locked the same way, in their own browser.
(function () {
  // Two sealed copies travel in the page. The first password opens everything. The second opens the bank-only copy,
  // which was made without tokens, freight and management discount, so those figures are not in it at all.
  const COPIES = { full: window.CRM_SEALED, bank: window.CRM_SEALED_BANK };
  let mode = 'full';
  let SEALED = COPIES.full;
  let KEEP = 'magppie-crm-saved';
  function use(which) { mode = which; SEALED = COPIES[which]; KEEP = 'magppie-crm-saved' + (which === 'bank' ? '-bank' : ''); window.CRM_BANK_ONLY = which === 'bank'; }
  const real = window.fetch ? window.fetch.bind(window) : null;
  let key = null;      // raw key bytes, once the password has been accepted
  let latest = null;

  function bytes(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  function b64(buf) { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function answer(obj, status) {
    return Promise.resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  }
  function note(text) {
    let bar = document.getElementById('online-note');
    if (!text) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'online-note'; bar.setAttribute('role', 'status'); document.body.append(bar); }
    bar.textContent = text;
  }

  // The sealed copy is in the standard openssl layout: "Salted__", 8 bytes of salt, then AES-256-CBC.
  function open(keyBytes, iv, body) {
    return crypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['decrypt'])
      .then(function (k) { return crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, k, body); })
      .then(function (plain) { const data = JSON.parse(new TextDecoder().decode(plain)); if (!data || !data.clients) throw new Error('wrong'); return data; });
  }
  function keep() {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    return crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt'])
      .then(function (k) { return crypto.subtle.encrypt({ name: 'AES-CBC', iv: iv }, k, new TextEncoder().encode(JSON.stringify(latest))); })
      .then(function (ct) { localStorage.setItem(KEEP, b64(iv) + '.' + b64(ct)); });
  }
  function kept() {
    let saved = null;
    try { saved = localStorage.getItem(KEEP); } catch (e) { /* storage may be blocked */ }
    if (!saved) return Promise.resolve(null);
    const parts = saved.split('.');
    return open(key, bytes(parts[0]), bytes(parts[1])).catch(function () { return null; });
  }
  function begin(found) {
    key = found.key;
    try { sessionStorage.setItem('crm-key', b64(key)); sessionStorage.setItem('crm-mode', mode); } catch (e) { /* asked again after a reload */ }
    return kept().then(function (mine) { latest = mine && (mine.rev || 0) >= (found.data.rev || 0) ? mine : found.data; });
  }

  // The password screen.
  function ask() {
    return new Promise(function (done) {
      const wrap = document.createElement('form');
      wrap.id = 'gate';
      wrap.innerHTML = '<div class="gate-box"><div class="gate-brand">MAGPPIE <span>CRM</span></div>' +
        '<label for="gate-pass">Password</label><input id="gate-pass" type="password" autocomplete="current-password" autofocus>' +
        '<div id="gate-msg" role="alert"></div><button type="submit">Open</button></div>';
      document.body.append(wrap);
      const box = wrap.querySelector('#gate-pass'), msg = wrap.querySelector('#gate-msg'), btn = wrap.querySelector('button');
      wrap.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!box.value) return;
        btn.disabled = true; msg.textContent = 'Opening…';
        unlock(box.value).then(function (found) { return begin(found).then(function () { wrap.remove(); done(); }); },
          function () { btn.disabled = false; msg.textContent = 'That password is not right.'; box.select(); });
      });
    });
  }
  // After a move between departments the page reloads; the same tab is not asked twice.
  // A refresh by the person always asks for the password again. Only the page's own reload, when moving between
  // departments, is let through once.
  function resume() {
    let saved = '', hop = false;
    try {
      hop = sessionStorage.getItem('crm-hop') === '1';
      sessionStorage.removeItem('crm-hop');
      if (!hop) {
        sessionStorage.removeItem('crm-key'); sessionStorage.removeItem('crm-iv'); sessionStorage.removeItem('crm-mode');
        // After the password, the first screen is always Sales, on Qualified leads.
        sessionStorage.removeItem('crm-dept');
        try { history.replaceState(null, '', location.pathname + location.search + '#qualified'); } catch (err) { location.hash = 'qualified'; }
      }
      saved = sessionStorage.getItem('crm-key') || '';
    } catch (e) { /* ask again */ }
    if (!saved) return Promise.reject();
    let which = 'full';
    try { which = sessionStorage.getItem('crm-mode') === 'bank' && COPIES.bank ? 'bank' : 'full'; } catch (e) { /* full */ }
    use(which);
    const raw = bytes(SEALED);
    const keyBytes = bytes(saved);
    // The first block of the sealed copy needs its own starting block, which only the password gives. Keep it beside the key.
    let iv = '';
    try { iv = sessionStorage.getItem('crm-iv') || ''; } catch (e) { /* ask again */ }
    if (!iv) return Promise.reject();
    return open(keyBytes, bytes(iv), raw.slice(16)).then(function (data) { return begin({ data: data, key: keyBytes }); });
  }
  // Try the password on the full copy first, then on the bank-only copy.
  function unlock(password) {
    use('full');
    return unlockOne(password).catch(function () { if (!COPIES.bank) throw new Error('wrong'); use('bank'); return unlockOne(password); });
  }
  function unlockOne(password) {
    const raw = bytes(SEALED);
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) { return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: raw.slice(8, 16), iterations: 200000 }, k, 384); })
      .then(function (bits) {
        const all = new Uint8Array(bits);
        return open(all.slice(0, 32), all.slice(32, 48), raw.slice(16)).then(function (data) {
          try { sessionStorage.setItem('crm-iv', b64(all.slice(32, 48))); } catch (e) { /* asked again after a reload */ }
          return { data: data, key: all.slice(0, 32) };
        });
      });
  }

  window.fetch = function (url, opt) {
    const path = String(url).split('?')[0];
    const method = ((opt && opt.method) || 'GET').toUpperCase();
    if (path === '/api/store' && method === 'GET') return answer(latest || { clients: [], rev: 0 });
    if (path === '/api/store' && method === 'PUT') {
      let incoming;
      try { incoming = JSON.parse(opt.body); } catch (e) { return answer({ error: 'not json' }, 400); }
      if (latest && (incoming.rev || 0) !== (latest.rev || 0)) return answer({ error: 'stale', rev: latest.rev || 0 }, 409);
      incoming.rev = (incoming.rev || 0) + 1;
      latest = incoming;
      return keep().then(function () { return answer({ ok: true, rev: incoming.rev }); },
        function () { note('This change could not be kept in this browser. It will be lost on refresh.'); return answer({ ok: true, rev: incoming.rev }); });
    }
    // Files are not kept online. The name is recorded so the journey can carry on.
    if (path.indexOf('/api/upload/') === 0) return answer({ ok: true, name: decodeURIComponent(path.split('/').pop()).replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[. ]+|[. ]+$/g, '') });
    if (path === '/api/reset') return answer({ ok: true });
    return real ? real(url, opt) : Promise.reject(new Error('no fetch'));
  };

  // Links between departments, and links to uploaded files.
  const DEPTS = ['sales', 'design', 'measurement', 'accounts', 'management'];
  function current() {
    let d = '';
    try { d = sessionStorage.getItem('crm-dept') || ''; } catch (e) { /* storage may be blocked */ }
    return DEPTS.indexOf(d) >= 0 ? d : 'sales';
  }
  document.addEventListener('click', function (e) {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href');
    const dept = (/^\/([a-z]+)\/$/.exec(href) || [])[1];
    if (dept && DEPTS.indexOf(dept) >= 0) {
      e.preventDefault();
      if (dept === (shown || current())) return;
      try { sessionStorage.setItem('crm-dept', dept); } catch (err) { /* the choice lasts for this visit only */ }
      window.OnlineCRM.show(dept);
      return;
    }
    if (href.indexOf('/data/uploads/') === 0) {
      e.preventDefault();
      note('Uploaded files open on the laptop copy only.');
      setTimeout(function () { note(''); }, 3500);
    }
  }, true);

  // Show a department. The first time it is started; after that it is simply drawn again. The page never reloads,
  // so nothing flashes and the password is not asked for again.
  let shown = '';
  function show(dept) {
    const shown0 = shown;
    shown = dept;
    document.getElementById('management-look').media = dept === 'management' ? 'all' : 'not all';
    if (shown0) try { history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* keep the address as it is */ }
    if (window.Kit && Kit.apps[dept]) { Kit.activeApp = dept; Kit.apps[dept](); } else window.CRM_START(dept);
  }
  window.OnlineCRM = { dept: function () { return shown || current(); }, show: show, open: function () { return resume().catch(ask); } };
})();
