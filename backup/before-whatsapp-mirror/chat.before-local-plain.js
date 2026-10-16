// WhatsApp in Sales. All of it is in this one file; see README.md to switch it off.
// Live today: the WhatsApp button (opens the client's chat in the WhatsApp app), the mirror and type box in a lead,
// and, on Windows PCs with the helper (windows-helper/), sending text, photos and PDFs from the CRM plus the watchdog light.
// Switched off: the TimelinesAI chat (TIMELINES below).
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
  const SIDE_BY_SIDE = false;   // switched off 14 Oct 2026: Manish chose the mirror instead
  // The mirror: a live picture of the WhatsApp app shown inside the client's screen (view only). false = no mirror.
  const MIRROR = true;
  // The Windows helper (windows-helper/) on 127.0.0.1:47321: when it is running, the mirror needs no "share your
  // screen" question and Send sends straight away. Without it, everything works the plain way.
  const HELPER = 'http://127.0.0.1:47321';
  const helper = { ok: false, checked: false };
  function checkHelper(then) {
    if (helper.checked) { if (then) then(); return; }
    fetch(HELPER + '/ping', { cache: 'no-store' }).then(function (r) { helper.ok = r.ok; })
      .catch(function () { helper.ok = false; })
      .then(function () { helper.checked = true; if (then) then(); });
  }
  if (/Windows/i.test(navigator.userAgent)) checkHelper();

  // The watchdog: every 30 seconds the helper is asked how things are. Any problem turns the WhatsApp light red.
  const watch = { data: null, lost: false, open: false, ctx: null };
  function problems() {
    const out = [];
    if (watch.lost) out.push('The WhatsApp helper on this PC has stopped. Restart the PC, or run install.cmd again.');
    const d = watch.data;
    if (!d) return out;
    if (!d.whatsappOpen) out.push('WhatsApp is not open on this PC. Open the WhatsApp app.');
    if (d.updated) out.push('WhatsApp updated (' + d.knownVersion + ' to ' + d.version + '). Send one test message, then mark it as checked.');
    if (mirroring() && mirror.helperOn && mirror.lastFrame && Date.now() - mirror.lastFrame > 15000) out.push('No picture from WhatsApp for ' + Math.round((Date.now() - mirror.lastFrame) / 1000) + ' seconds. WhatsApp may be minimised or closed.');
    (d.problems || []).forEach(function (p) { out.push(p); });
    return out;
  }
  function poll() {
    if (!/Windows/i.test(navigator.userAgent)) return;
    if (!helper.ok && !watch.data) {
      fetch(HELPER + '/ping', { cache: 'no-store' }).then(function (r) { if (r.ok) { helper.ok = true; helper.checked = true; poll(); if (watch.ctx) watch.ctx.update(); } }).catch(function () {});
      return;
    }
    fetch(HELPER + '/health', { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (d) { const was = JSON.stringify(watch.data) + watch.lost; watch.data = d; watch.lost = false; if (was !== JSON.stringify(d) + false && watch.ctx) watch.ctx.update(); })
      .catch(function () { if (!watch.lost) { watch.lost = true; if (watch.ctx) watch.ctx.update(); } });
  }
  setInterval(poll, 30000);
  setTimeout(poll, 3000);
  function watchLight(ctx) {
    watch.ctx = ctx;
    if (!helper.ok && !watch.data && !watch.lost) return null;
    const list = problems(), bad = list.length > 0;
    const light = h('button', { type: 'button', class: 'btn small line', style: 'display: inline-flex; align-items: center; gap: 6px' + (bad ? '; color: #B3261E; border-color: #B3261E' : ''),
      'aria-expanded': watch.open ? 'true' : 'false', onclick: function () { watch.open = !watch.open; ctx.update(); } },
      h('span', { style: 'width: 8px; height: 8px; border-radius: 50%; background: ' + (bad ? '#B3261E' : GREEN) }), bad ? 'WhatsApp: ' + list.length + ' problem' + (list.length > 1 ? 's' : '') : 'WhatsApp OK');
    if (!watch.open) return light;
    const d = watch.data || {};
    return h('span', { style: 'position: relative; display: inline-flex' }, light,
      h('div', { class: 'card', role: 'dialog', 'aria-label': 'WhatsApp health', style: 'position: absolute; top: 110%; left: 0; z-index: 50; width: 360px; padding: 12px 14px; gap: 8px; box-shadow: 0 10px 30px rgba(20, 30, 50, 0.2)' },
        h('b', null, 'WhatsApp health'),
        h('div', { class: 'sub' }, 'Sent ' + (d.sent || 0) + ' · may not have gone ' + (d.suspect || 0) + ' · failed ' + (d.failed || 0) + (d.version ? ' · WhatsApp ' + d.version : '')),
        list.length ? list.map(function (p) { return h('div', { class: 'msg', style: 'font-size: 12.5px' }, p); }) : h('div', { class: 'hint' }, 'Everything is working.'),
        d.updated ? Kit.btn('Mark WhatsApp update as checked', function () { fetch(HELPER + '/ackversion', { cache: 'no-store' }).then(poll).catch(function () {}); }, 'small') : null,
        Kit.btn('Close', function () { watch.open = false; ctx.update(); }, 'small line')));
  }
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
        const open = function () {
          let go = link();
          if (SIDE_BY_SIDE && /Windows/i.test(navigator.userAgent)) {
            const plain = go;
            go = 'magppiewa://open/' + plain.replace(/[^0-9]/g, '');
            let left = false;
            const gone = function () { left = true; };
            window.addEventListener('blur', gone, { once: true });
            setTimeout(function () { window.removeEventListener('blur', gone); if (!left) { if (window.top !== window.self) window.open(plain, '_blank'); else location.href = plain; } }, 2500);
          }
          // Inside claude.ai the page is framed, so the app is asked for from a new tab. On its own site it opens directly.
          if (window.top !== window.self) window.open(go, '_blank');
          else location.href = go;
        };
        if (helper.ok) {
          fetch(HELPER + '/open?phone=' + encodeURIComponent(link().replace(/[^0-9]/g, '')), { cache: 'no-store' }).catch(function () {});
          if (MIRROR) { if (!mirror.helperOn) mirror.lastFrame = Date.now(); mirror.helperOn = true; mirror.hidden = false; if (mirror.ctx) mirror.ctx.update(); }
          return;
        }
        // The mirror: the first click on a page asks which window to show (pick the WhatsApp window). After that
        // the picture stays live and every click only switches the chat.
        if (MIRROR && !mirror.stream && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then(function (stream) {
            mirror.stream = stream; mirror.hidden = false; mirror.video.srcObject = stream;
            stream.getVideoTracks()[0].addEventListener('ended', function () { mirror.stream = null; mirror.video.srcObject = null; if (mirror.ctx) mirror.ctx.update(); });
            if (mirror.ctx) mirror.ctx.update();
            open();
          }).catch(function () { open(); });
          return;
        }
        if (MIRROR && mirror.stream) { mirror.hidden = false; if (mirror.ctx) mirror.ctx.update(); }
        open();
      } });
    app.innerHTML = icon(15) + '<span>WhatsApp</span>';
    return app;
  }
  function button(c, ctx) {
    if (MIRROR) mirror.ctx = ctx;   // so the mirror shows the moment the window is picked
    if (ONLINE) return h('span', { style: 'display: contents' }, webButton(c), watchLight(ctx));
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
    return h('span', { style: 'display: contents' }, b, webButton(c), watchLight(ctx));
  }
  setInterval(function () { if (pop && !document.querySelector('.wa-btn[data-id="' + popFor + '"][aria-expanded="true"]')) { open[popFor] = false; shut(); } }, 300);

  // The mirror box: one video kept between redraws so the picture never flickers.
  const mirror = { stream: null, helperOn: false, hidden: false, ctx: null, video: null, img: null, timer: null, pulling: false, lastFrame: 0 };
  mirror.img = h('img', { alt: 'WhatsApp', style: 'width: 100%; flex: 1; min-height: 360px; background: #0B141A; border-radius: 10px; object-fit: contain' });
  // With the helper, a fresh picture of the WhatsApp window is fetched every half second while the mirror is on screen.
  // Only one stream of pictures runs at a time, however often the screen is redrawn (several at once used to pile up and slow the helper).
  function pull() {
    if (mirror.pulling || mirror.sending) return;
    clearTimeout(mirror.timer); mirror.timer = null;
    if (!mirror.helperOn || mirror.hidden || !document.body.contains(mirror.img)) return;
    mirror.pulling = true;
    fetch(HELPER + '/frame', { cache: 'no-store' }).then(function (r) { return r.status === 200 ? r.blob() : null; }).then(function (b) {
      if (b) { mirror.lastFrame = Date.now(); const old = mirror.img.src; mirror.img.src = URL.createObjectURL(b); if (old && old.indexOf('blob:') === 0) URL.revokeObjectURL(old); }
    }).catch(function () {}).then(function () { mirror.pulling = false; mirror.timer = setTimeout(pull, 350); });
  }
  mirror.video = h('video', { autoplay: true, muted: true, playsinline: true, style: 'width: 100%; flex: 1; min-height: 360px; background: #0B141A; border-radius: 10px; object-fit: contain' });
  function mirroring() { return MIRROR && (!!mirror.stream || mirror.helperOn) && !mirror.hidden; }
  function mirrorBox(c, ctx) {
    mirror.ctx = ctx;
    return h('div', { style: 'display: flex; flex-direction: column; gap: 10px; min-height: 420px' },
      h('div', { class: 'flexrow', style: 'justify-content: space-between' },
        h('span', null, h('b', null, 'WhatsApp'), h('span', { class: 'sub' }, ' · live mirror · type in the WhatsApp app')),
        h('span', { class: 'flexrow' },
          Kit.btn('Show the form', function () { mirror.hidden = true; ctx.update(); }, 'small line'),
          Kit.btn('Stop mirror', function () { if (mirror.stream) mirror.stream.getTracks().forEach(function (t) { t.stop(); }); mirror.stream = null; mirror.video.srcObject = null; mirror.helperOn = false; ctx.update(); }, 'small'))),
      mirror.helperOn ? (setTimeout(pull, 0), mirror.img) : mirror.video,
      typeBox(c, ctx));
  }
  // Type under the mirror: the message is put into this client's chat in the WhatsApp app, ready to go;
  // one press of Enter in WhatsApp sends it. It is also saved on the client's contact list.
  const typed = {};
  const MAX_FILES = 10, MAX_BYTES = 100 * 1024 * 1024;
  function number(c) { const d = String(c.phone || '').replace(/[^0-9]/g, ''); return d.length === 10 ? '91' + d : d; }
  function typeBox(c, ctx) {
    const t = typed[c.id] = typed[c.id] || { text: '', input: null, msg: '', files: [], pick: null };
    const fresh = !t.input;
    const input = t.input = t.input || h('input', { type: 'text', placeholder: 'Type a message for ' + c.name, 'aria-label': 'WhatsApp message' });
    const focused = document.activeElement === input;
    if (input.value !== t.text) input.value = t.text;
    if (fresh) input.addEventListener('input', function () { t.text = input.value; });
    if (focused) setTimeout(function () { input.focus(); }, 0);

    // Text and any attached photos, videos and PDFs go out together: the files in one go, the text as their caption.
    const send = function () {
      const text = t.text.trim(), files = t.files.slice();
      if (!text && !files.length) return;
      const n = number(c);
      if (n.length < 11) { t.msg = 'Add the client\'s phone number first.'; return ctx.update(); }
      const note = text + (files.length ? (text ? ' · ' : '') + 'Files: ' + files.map(function (f) { return f.name; }).join(', ') : '');
      const saved = function () { ctx.update(function () { c.contacts.unshift({ at: Kit.now(), type: 'WhatsApp', outcome: 'Message sent', note: note }); }); };
      if (helper.ok) {
        // The box empties at once, so the next message can be typed while this one goes out.
        t.text = ''; input.value = ''; t.files = [];
        mirror.sending = true; clearTimeout(mirror.timer);
        const resume = function () { mirror.sending = false; setTimeout(pull, 600); };
        t.msg = files.length ? 'Sending ' + files.length + ' file(s)' + (text ? ' and the message' : '') + '...' : 'Sending...'; ctx.update();
        const stage = function (i, ids) {
          if (i >= files.length) return Promise.resolve(ids);
          return fetch(HELPER + '/stage?name=' + encodeURIComponent(files[i].name), { method: 'POST', body: files[i], cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('file'); return r.text(); })
            .then(function (id) { return stage(i + 1, ids.concat([id.trim()])); });
        };
        stage(0, []).then(function (ids) {
          return fetch(HELPER + '/send?phone=' + n + '&text=' + encodeURIComponent(text) + '&files=' + ids.join(','), { cache: 'no-store' })
            .then(function (r) { return r.text().then(function (said) { return { ok: r.ok, said: said }; }); });
        }).then(function (r) {
          resume();
          if (!r.ok) { t.text = text; input.value = text; t.files = files; t.msg = 'Not sent: ' + r.said; return ctx.update(); }
          t.msg = 'Sent.'; saved();
        }).catch(function () { resume(); t.text = text; input.value = text; t.files = files; t.msg = 'Not sent: the WhatsApp helper on this PC did not answer.'; ctx.update(); });
        return;
      }
      if (files.length) { t.msg = 'Files go only through the WhatsApp helper on a Windows PC.'; return ctx.update(); }
      const go = 'whatsapp://send?phone=' + n + '&text=' + encodeURIComponent(text);
      if (window.top !== window.self) window.open(go, '_blank'); else location.href = go;
      t.text = ''; input.value = ''; t.msg = 'In WhatsApp now: press Enter there to send.';
      saved();
    };
    if (fresh) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') t.send(); });
    t.send = send;

    // Attach: several at once, added to the tray under the box; each can be taken off before sending.
    let attach = null;
    if (helper.ok) {
      if (!t.pick) {
        t.pick = h('input', { type: 'file', multiple: true, accept: 'image/*,video/*,application/pdf', style: 'display: none' });
        t.pick.addEventListener('change', function () {
          const chosen = Array.prototype.slice.call(t.pick.files || []); t.pick.value = '';
          const all = t.files.concat(chosen).slice(0, MAX_FILES);
          const total = all.reduce(function (sum, f) { return sum + f.size; }, 0);
          if (total > MAX_BYTES) { t.msg = 'Together these are over 100 MB. Send fewer or smaller files.'; return t.ctx.update(); }
          t.msg = t.files.length + chosen.length > MAX_FILES ? 'Up to ' + MAX_FILES + ' files at a time.' : '';
          t.files = all; t.ctx.update();
        });
      }
      attach = h('span', null, t.pick, Kit.btn('Attach', function () { t.pick.click(); }, 'line'));
    }
    t.ctx = ctx;
    const tray = !t.files.length ? null : h('div', { class: 'flexrow', style: 'flex-wrap: wrap; gap: 6px' }, t.files.map(function (f, i) {
      const kind = /^image\//.test(f.type) ? 'Photo' : (/^video\//.test(f.type) ? 'Video' : 'PDF');
      return h('span', { class: 'pill', style: 'display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; background: #EEF2F8; border-radius: 999px; font-size: 12px' },
        kind + ' · ' + (f.name.length > 28 ? f.name.slice(0, 25) + '...' : f.name),
        h('button', { type: 'button', 'aria-label': 'Remove ' + f.name, style: 'border: 0; background: none; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 4px', onclick: function () { t.files.splice(i, 1); ctx.update(); } }, '×'));
    }));
    return h('div', { style: 'display: flex; flex-direction: column; gap: 6px' },
      h('div', { class: 'flexrow' }, h('div', { class: 'grow' }, input), attach, Kit.btn('Send to WhatsApp', send, 'dark')),
      tray,
      t.msg ? h('div', { class: 'hint' }, t.msg) : null);
  }
  // A small link back to the mirror while the form is showing.
  function mirrorLink(ctx) {
    if (!MIRROR || !(mirror.stream || mirror.helperOn) || !mirror.hidden) return null;
    return Kit.btn('Show WhatsApp mirror', function () { mirror.hidden = false; ctx.update(); }, 'small line');
  }

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

  window.WhatsApp = { box: box, button: button, tile: tile, mirroring: mirroring, mirrorBox: mirrorBox, mirrorLink: mirrorLink, helper: helper, checkHelper: checkHelper };
  if (!ONLINE) Sales.register({ id: 'whatsapp', title: 'WhatsApp', short: 'WhatsApp', page: true, small: true, table: table });
})();
