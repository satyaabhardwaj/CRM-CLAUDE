// WhatsApp in Sales, through TimelinesAI (see /whatsapp). All of it is in this one file; see README.md to switch it off.
//   1. WhatsApp.button: a button in the client's header. It opens the chat with that client in a small window.
//   2. WhatsApp.tile: the round WhatsApp icon after the "Collected" tile. It opens the WhatsApp screen.
//   3. The WhatsApp screen: every chat on the linked number, and the client each one belongs to.
// What you send, and what the client replies, is saved on the client's contact list.
// The online copy has no backend to reach WhatsApp, so nothing here shows there.
(function () {
  const h = Kit.h;
  // THE SWITCH for TimelinesAI (chat inside the CRM, the green icon, the WhatsApp screen).
  // false = switched off: only the "WhatsApp Web" button stays. true = switched back on.
  // To switch it off again: set this to false and rename whatsapp/keys.env to keys.env.off.
  const TIMELINES = false;
  // Windows only: open WhatsApp beside the browser, CRM left and WhatsApp right.
  // Needs windows-split/install.cmd once per PC. false = plain WhatsApp app.
  const SIDE_BY_SIDE = true;
  const ONLINE = !!window.OnlineCRM || !TIMELINES;
  const chats = {};
  const open = {};
  const EVERY = 20000;
  const GREEN = '#1FA855';
  const ICON = '<svg aria-hidden="true" width="SZ" height="SZ" viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.3 7.9c-.4 1.3.3 3 1.7 4.4 1.4 1.4 3.1 2.1 4.4 1.7l.7-1.4-1.9-1.1-.8.7c-.8-.4-1.600-1.200-2-2l.7-.8-1.1-1.9z" fill="currentColor"/></svg>';
  const icon = function (size) { return ICON.replace(/SZ/g, size); };

  const style = document.createElement('style');
  style.textContent = [
    '.wa { display: flex; flex-direction: column; gap: 8px; }',
    '.wa-thread { display: flex; flex-direction: column; gap: 6px; height: 300px; overflow-y: auto; background: #F3F5F8; border-radius: 10px; padding: 10px; }',
    '.wa-msg { align-self: flex-start; max-width: 85%; background: #FFFFFF; border-radius: 10px; padding: 6px 10px; font-size: 13px; display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }',
    '.wa-msg.mine { align-self: flex-end; background: #DDF3E2; }',
    '.wa-msg small { font-size: 10.5px; color: var(--ink3); }',
    '.wa-btn { display: inline-flex; align-items: center; gap: 6px; color: ' + GREEN + '; border-color: ' + GREEN + '; }',
    '.wa-btn * { pointer-events: none; }',
    'a.wa-btn { text-decoration: none; }',
    '.wa-pop { position: fixed; right: 24px; bottom: 24px; width: 370px; max-width: calc(100vw - 32px); background: #FFFFFF; border-radius: 14px; box-shadow: 0 12px 40px rgba(20, 30, 50, 0.28); padding: 14px; z-index: 2000; display: flex; flex-direction: column; gap: 10px; }',
    '.wa-tile { flex: none; align-self: center; width: 52px; height: 52px; border-radius: 50%; border: 0; background: ' + GREEN + '; color: #FFFFFF; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }',
    '.wa-tile:hover { filter: brightness(0.94); }',
    '.wa-page { display: grid; grid-template-columns: minmax(240px, 340px) minmax(0, 1fr); gap: 12px; flex: 1; min-height: 0; }',
    '.wa-list { overflow-y: auto; }',
    '.wa-list button { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 10px 14px; border: 0; border-bottom: 1px solid #EEF1F5; background: none; cursor: pointer; }',
    '.wa-list button.on { background: #EAF6EE; }',
    '.wa-list small { color: var(--ink3); font-size: 11.5px; }',
    '.wa-page .wa-thread { height: auto; flex: 1; min-height: 240px; }'
  ].join('\n');
  document.head.append(style);

  function state(c) { return chats[c.id] = chats[c.id] || { phone: c.phone, list: null, error: '', text: '', busy: false, at: 0, loading: false }; }
  const last10 = function (p) { return String(p || '').replace(/[^0-9]/g, '').slice(-10); };

  function load(c, ctx) {
    const s = state(c);
    if (s.loading) return;
    s.loading = true; s.at = Date.now();
    fetch('/api/whatsapp/chat?phone=' + encodeURIComponent(c.phone || ''))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, code: r.status, j: j }; }); })
      .then(function (r) {
        s.loading = false;
        if (!r.ok) { s.error = r.code === 503 ? 'WhatsApp is not set up yet. The TimelinesAI token goes in whatsapp/keys.env.' : (r.j.error || 'WhatsApp could not be read.'); s.list = s.list || []; return ctx.update(); }
        const got = r.j.messages || [];
        const mark = function (l) { return l && l.length ? l.length + '|' + l[l.length - 1].uid + '|' + l[l.length - 1].status : '0'; };
        const same = s.list !== null && !s.error && mark(s.list.filter(function (m) { return String(m.uid).indexOf('new') !== 0; })) === mark(got) && s.list.length === got.length;
        s.error = ''; s.list = got;
        if (same) return;
        // Replies that came since the last look are saved on the client. The first look only notes where the chat stands.
        const newest = s.list.length ? s.list[s.list.length - 1].at : '';
        const fresh = c.wa ? s.list.filter(function (m) { return !m.mine && m.at > c.wa.at; }) : [];
        if (c.real !== false && (!c.wa || fresh.length || newest > c.wa.at)) {
          ctx.update(function () {
            fresh.forEach(function (m) { c.contacts.unshift({ at: m.at, type: 'WhatsApp', outcome: 'Client replied', note: m.text || m.file || '' }); });
            c.wa = { at: newest || (c.wa ? c.wa.at : '') };
          });
        } else ctx.update();
      })
      .catch(function () { s.loading = false; s.error = 'WhatsApp could not be reached.'; s.list = s.list || []; ctx.update(); });
  }

  // The chat itself: the messages and the box to type in. Used in the small window and on the WhatsApp screen.
  function box(c, ctx) {
    const s = state(c);
    if (s.phone !== c.phone) { s.phone = c.phone; s.list = null; }
    if (!c.phone) return h('div', { class: 'wa' }, h('div', { class: 'hint' }, 'Add the client\'s phone number to chat on WhatsApp.'));
    if (s.list === null || Date.now() - s.at > EVERY) setTimeout(function () { load(c, ctx); }, 0);
    // While the chat is on screen, look again every 20 seconds.
    clearTimeout(s.timer);
    s.timer = setTimeout(function () { if (document.querySelector('.wa[data-id="' + c.id + '"]')) load(c, ctx); }, EVERY + 500);

    const fresh = !s.input;
    const input = s.input = s.input || h('input', { type: 'text', placeholder: 'Type a WhatsApp message', 'aria-label': 'WhatsApp message' });
    const typing = document.activeElement === input;
    if (input.value !== s.text) input.value = s.text;
    if (fresh) input.addEventListener('input', function () { s.text = input.value; });
    s.ctx = ctx;
    if (typing) setTimeout(function () { input.focus(); }, 0);
    const send = function () {
      const ctx = s.ctx;
      const text = s.text.trim();
      if (!text || s.busy) return;
      s.busy = true; s.error = ''; ctx.update();
      fetch('/api/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: c.phone, text: text }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) {
          s.busy = false;
          if (!r.ok) { s.error = r.j.error || 'The message was not sent.'; return ctx.update(); }
          s.text = '';
          s.list = (s.list || []).concat([{ uid: 'new' + Date.now(), at: Kit.now(), mine: true, text: text, status: 'Sending' }]);
          if (c.real === false) ctx.update();
          else ctx.update(function () { c.contacts.unshift({ at: Kit.now(), type: 'WhatsApp', outcome: 'Message sent', note: text }); });
          setTimeout(function () { load(c, ctx); }, 4000);
        })
        .catch(function () { s.busy = false; s.error = 'WhatsApp could not be reached.'; ctx.update(); });
    };
    if (fresh) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') s.send(); });
    s.send = send;
    const list = s.list || [];
    const thread = h('div', { class: 'wa-thread' },
      s.list === null ? h('div', { class: 'hint' }, 'Opening the chat...') :
      (list.length ? list.map(function (m) {
        return h('div', { class: 'wa-msg' + (m.mine ? ' mine' : '') }, h('span', null, m.text || (m.file ? 'File: ' + m.file : '')), h('small', null, Kit.dayTime(m.at) + (m.mine && m.status ? ' · ' + m.status : '')));
      }) : h('div', { class: 'hint' }, 'No WhatsApp chat with this number yet. Send the first message below.')));
    // Always show the newest message.
    setTimeout(function () { const el = document.querySelector('.wa[data-id="' + c.id + '"] .wa-thread'); if (el) el.scrollTop = el.scrollHeight; }, 0);
    return h('div', { class: 'wa', 'data-id': c.id },
      thread,
      h('div', { class: 'flexrow' }, h('div', { class: 'grow' }, input), Kit.btn(s.busy ? 'Sending' : 'Send', send, 'dark')),
      s.error ? h('div', { class: 'msg' }, s.error) : null);
  }

  // 1 · The button in the client's header, and the small chat window it opens.
  // The window is put on the page itself (not inside the client window), so it is always in view at the bottom right.
  let pop = null, popFor = '';
  function shut() { if (pop) pop.remove(); pop = null; popFor = ''; }
  // "WhatsApp Web" opens the sales person's own WhatsApp Web in a new browser tab, straight on this client's chat
  // when the client has a phone number. WhatsApp does not allow itself to be shown inside another site, so it is a new tab.
  function webButton(c) {
    const digits = String(c.phone || '').replace(/[^0-9]/g, '');
    const to = digits.length === 10 ? '91' + digits : digits;
    const ok = to.length >= 11;
    // The WhatsApp app (Mac or Windows) keeps one window: every click switches that same window to this client's chat.
    // The number is read at the moment of the click, so a number just typed or changed is the one that opens.
    const link = function () {
      const d = String(c.phone || '').replace(/[^0-9]/g, '');
      const n = d.length === 10 ? '91' + d : d;
      return n.length >= 11 ? 'whatsapp://send?phone=' + n : 'whatsapp://';
    };
    const app = h('a', { class: 'btn small line wa-btn', title: 'Open this chat in the WhatsApp app. Same window every time.',
      href: ok ? 'whatsapp://send?phone=' + to : 'whatsapp://',
      onclick: function (e) {
        e.preventDefault();
        // On the online copy the CRM sits inside claude.ai. Sending that inner page to "whatsapp://" leaves it blank,
        // so there the app is asked for from a separate tab; the CRM itself never moves.
        // Windows PCs with the side-by-side helper (windows-split/) get magppiewa://, which opens WhatsApp and
        // arranges the browser left and WhatsApp right. If the helper is not installed, nothing takes the click,
        // so after 2.5 seconds the WhatsApp app is opened the plain way.
        let go = link();
        if (SIDE_BY_SIDE && /Windows/i.test(navigator.userAgent)) {
          const plain = go;
          go = 'magppiewa://open/' + plain.replace(/[^0-9]/g, '');
          let left = false;
          const gone = function () { left = true; };
          window.addEventListener('blur', gone, { once: true });
          setTimeout(function () { window.removeEventListener('blur', gone); if (!left) { if (window.top !== window.self) window.open(plain, '_blank'); else location.href = plain; } }, 2500);
        }
        // Inside claude.ai the page is framed, so the app is asked for from a new tab. On its own site (Vercel) it opens directly.
        if (window.top !== window.self) window.open(go, '_blank');
        else location.href = go;
      } });
    app.innerHTML = icon(15) + '<span>WhatsApp</span>';
    return app;
  }
  function button(c, ctx) {
    if (ONLINE) return webButton(c);
    const b = h('button', { type: 'button', class: 'btn small line wa-btn', 'data-id': c.id, 'aria-expanded': open[c.id] ? 'true' : 'false',
      onclick: function () { open[c.id] = !open[c.id]; if (!open[c.id]) shut(); ctx.update(); } });
    b.innerHTML = icon(15) + '<span>WhatsApp</span>';
    if (open[c.id]) {
      if (!pop) { pop = h('div', { class: 'wa-pop', role: 'dialog' }); document.body.append(pop); }
      popFor = c.id;
      pop.setAttribute('aria-label', 'WhatsApp with ' + c.name);
      pop.replaceChildren(
        h('div', { class: 'flexrow', style: 'justify-content: space-between' },
          h('span', null, h('b', null, c.name), h('span', { class: 'sub' }, c.phone ? ' · ' + c.phone : '')),
          Kit.btn('Close', function () { open[c.id] = false; shut(); ctx.update(); }, 'small')),
        box(c, ctx));
    }
    // When the client window is closed or another client is opened, the chat window goes with it.
    return h('span', { style: 'display: contents' }, b, webButton(c));
  }
  setInterval(function () { if (pop && !document.querySelector('.wa-btn[data-id="' + popFor + '"][aria-expanded="true"]')) { open[popFor] = false; shut(); } }, 300);

  // 2 · The round icon after the "Collected" tile.
  function tile() {
    if (ONLINE) return null;
    const b = h('button', { type: 'button', class: 'wa-tile', title: 'Open WhatsApp', 'aria-label': 'Open WhatsApp', onclick: function () { location.hash = 'whatsapp'; } });
    b.innerHTML = icon(28);
    return b;
  }

  // 3 · The WhatsApp screen.
  const page = { list: null, error: '', at: 0, loading: false, pick: '', everyone: true, find: '' };
  function loadChats(ctx) {
    if (page.loading) return;
    page.loading = true; page.at = Date.now();
    fetch('/api/whatsapp/chats').then(function (r) { return r.json().then(function (j) { return { ok: r.ok, code: r.status, j: j }; }); })
      .then(function (r) {
        page.loading = false;
        if (!r.ok) { page.error = r.code === 503 ? 'WhatsApp is not set up yet. The TimelinesAI token goes in whatsapp/keys.env.' : (r.j.error || 'WhatsApp could not be read.'); page.list = page.list || []; }
        else {
          const was = JSON.stringify(page.list);
          page.error = ''; page.list = r.j.chats || [];
          if (was === JSON.stringify(page.list)) return;
        }
        ctx.update();
      })
      .catch(function () { page.loading = false; page.error = 'WhatsApp could not be reached.'; page.list = page.list || []; ctx.update(); });
  }
  function table(ctx) {
    if (page.list === null || Date.now() - page.at > EVERY) setTimeout(function () { loadChats(ctx); }, 0);
    clearTimeout(page.timer);
    page.timer = setTimeout(function () { if (document.querySelector('.wa-page')) loadChats(ctx); }, EVERY + 500);
    const byPhone = {};
    ctx.everyone.forEach(function (c) { if (c.stage !== 'bin' && last10(c.phone).length === 10) byPhone[last10(c.phone)] = c; });
    const STAGE = { qualified: 'Qualified lead', design: 'In design', token: 'Booked', booked: 'Booked', post: 'Post-design', lost: 'Lost' };
    const q = page.find.trim().toLowerCase();
    const rows = (page.list || []).map(function (x) { return { x: x, c: byPhone[last10(x.phone)] || null }; })
      .filter(function (r) { return page.everyone || r.c; })
      .filter(function (r) { return !q || ((r.c ? r.c.name : '') + ' ' + r.x.name + ' ' + r.x.phone).toLowerCase().indexOf(q) >= 0; });
    const now = rows.find(function (r) { return String(r.x.id) === page.pick; }) || null;
    const search = h('input', { type: 'search', placeholder: 'Find a chat', 'aria-label': 'Find a chat', style: 'width: 180px' });
    search.value = page.find;
    search.addEventListener('input', function () { page.find = search.value; ctx.update(); });
    // A chat that is not a client's still opens; it is simply not saved on anyone.
    const who = !now ? null : (now.c || { id: 'wa' + now.x.id, name: now.x.name || now.x.phone, phone: now.x.phone, contacts: [], real: false });
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' }, h('div', null, h('h1', null, 'WhatsApp'),
        h('p', null, page.list === null ? 'Opening WhatsApp...' : rows.length + ' chat(s) · ' + (page.everyone ? 'every chat on the linked number' : 'only chats with a client in the CRM'))),
        h('div', { class: 'flexrow' },
          h('label', { class: 'flexrow' }, h('input', { type: 'checkbox', checked: page.everyone, onchange: function () { page.everyone = !page.everyone; ctx.update(); } }), 'Show every chat'),
          search)),
      page.error ? h('div', { class: 'msg' }, page.error) : null,
      h('div', { class: 'wa-page' },
        h('section', { class: 'card wa-list', 'data-keep': 'walist' },
          rows.length ? rows.map(function (r) {
            return h('button', { type: 'button', class: String(r.x.id) === page.pick ? 'on' : '', onclick: function () { page.pick = String(r.x.id); ctx.update(); } },
              h('b', null, r.c ? r.c.name : (r.x.name || r.x.phone), r.x.unread ? h('span', { style: 'color: ' + GREEN }, '  ●') : null),
              h('small', null, (r.c ? STAGE[r.c.stage] + ' · ' : 'Not a client · ') + r.x.phone + (r.x.at ? ' · ' + Kit.dayTime(r.x.at) : '')));
          }) : h('div', { class: 'empty' }, page.list === null ? 'Opening...' : (page.everyone ? 'No chats yet.' : 'No WhatsApp chat matches a client\'s phone number yet. Tick "Show every chat" to see the rest.'))),
        h('section', { class: 'card', style: 'padding: 14px; gap: 10px; display: flex; flex-direction: column; min-height: 0' },
          !who ? h('div', { class: 'empty' }, 'Pick a chat on the left.') : [
            h('div', { class: 'flexrow', style: 'justify-content: space-between' },
              h('span', null, h('b', null, who.name), h('span', { class: 'sub' }, ' · ' + who.phone)),
              now.c ? Kit.btn('Open client', function () { if (now.c.stage === 'post') ctx.goTo('tracker', now.c); else ctx.open(now.c); }, 'small line') : h('span', { class: 'sub' }, 'Not saved on any client')),
            box(who, ctx)])));
  }

  window.WhatsApp = { box: box, button: button, tile: tile };
  if (!ONLINE) Sales.register({ id: 'whatsapp', title: 'WhatsApp', short: 'WhatsApp', page: true, small: true, table: table });
})();
