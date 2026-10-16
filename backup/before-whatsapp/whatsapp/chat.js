// WhatsApp with the client, inside "Log a contact". It goes through TimelinesAI (see /whatsapp).
//   - The chat with the client's phone number is shown, newest at the bottom, and checked again every 20 seconds.
//   - What you type is sent from the linked WhatsApp number and saved on the client's contact list.
//   - A new reply from the client is saved on the contact list by itself.
// It works on the laptop copy. The online copy has no backend to reach WhatsApp, so the box says so.
(function () {
  const h = Kit.h;
  const chats = {};
  const EVERY = 20000;
  function state(c) { return chats[c.id] = chats[c.id] || { phone: c.phone, list: null, error: '', text: '', busy: false, at: 0, loading: false }; }

  function load(c, ctx) {
    const s = state(c);
    if (s.loading) return;
    s.loading = true; s.at = Date.now();
    fetch('/api/whatsapp/chat?phone=' + encodeURIComponent(c.phone || ''))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, code: r.status, j: j }; }); })
      .then(function (r) {
        s.loading = false;
        if (!r.ok) { s.error = r.code === 503 ? 'WhatsApp is not set up yet. The TimelinesAI token goes in whatsapp/keys.env.' : (r.j.error || 'WhatsApp could not be read.'); s.list = s.list || []; return ctx.update(); }
        s.error = ''; s.list = r.j.messages || [];
        // Replies that came since the last look are saved on the client. The first look only notes where the chat stands.
        const newest = s.list.length ? s.list[s.list.length - 1].at : '';
        const fresh = c.wa ? s.list.filter(function (m) { return !m.mine && m.at > c.wa.at; }) : [];
        if (!c.wa || fresh.length || newest > c.wa.at) {
          ctx.update(function () {
            fresh.forEach(function (m) { c.contacts.unshift({ at: m.at, type: 'WhatsApp', outcome: 'Client replied', note: m.text || m.file || '' }); });
            c.wa = { at: newest || (c.wa ? c.wa.at : '') };
          });
        } else ctx.update();
      })
      .catch(function () { s.loading = false; s.error = 'WhatsApp works on the laptop copy only.'; s.list = s.list || []; ctx.update(); });
  }

  function box(c, ctx) {
    // The online copy cannot reach WhatsApp, so the box is left out there.
    if (window.OnlineCRM) return null;
    const s = state(c);
    if (s.phone !== c.phone) { s.phone = c.phone; s.list = null; }
    if (!c.phone) return h('div', { class: 'wa' }, h('b', null, 'WhatsApp'), h('div', { class: 'hint' }, 'Add the client\'s phone number to chat on WhatsApp.'));
    if (s.list === null || Date.now() - s.at > EVERY) setTimeout(function () { load(c, ctx); }, 0);
    // While the card is on screen, look again every 20 seconds.
    clearTimeout(s.timer);
    s.timer = setTimeout(function () { if (document.querySelector('.wa[data-id="' + c.id + '"]')) load(c, ctx); }, EVERY + 500);

    const input = h('input', { type: 'text', placeholder: 'Type a WhatsApp message', 'aria-label': 'WhatsApp message' });
    input.value = s.text;
    input.addEventListener('input', function () { s.text = input.value; });
    const send = function () {
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
          ctx.update(function () { c.contacts.unshift({ at: Kit.now(), type: 'WhatsApp', outcome: 'Message sent', note: text }); });
          setTimeout(function () { load(c, ctx); }, 4000);
        })
        .catch(function () { s.busy = false; s.error = 'WhatsApp works on the laptop copy only.'; ctx.update(); });
    };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    const list = s.list || [];
    const thread = h('div', { class: 'wa-thread', 'data-keep': 'wa' + c.id },
      s.list === null ? h('div', { class: 'hint' }, 'Opening the chat...') :
      (list.length ? list.map(function (m) {
        return h('div', { class: 'wa-msg' + (m.mine ? ' mine' : '') }, h('span', null, m.text || (m.file ? 'File: ' + m.file : '')), h('small', null, Kit.dayTime(m.at) + (m.mine && m.status ? ' · ' + m.status : '')));
      }) : h('div', { class: 'hint' }, 'No WhatsApp chat with this number yet. Send the first message below.')));
    setTimeout(function () { const el = document.querySelector('.wa[data-id="' + c.id + '"] .wa-thread'); if (el && !el.dataset.set) { el.scrollTop = el.scrollHeight; el.dataset.set = '1'; } }, 0);
    return h('div', { class: 'wa', 'data-id': c.id },
      h('div', { class: 'flexrow', style: 'justify-content: space-between' }, h('b', null, 'WhatsApp'), h('span', { class: 'sub' }, c.phone)),
      thread,
      h('div', { class: 'flexrow' }, h('div', { class: 'grow' }, input), Kit.btn(s.busy ? 'Sending' : 'Send', send, 'dark')),
      s.error ? h('div', { class: 'msg' }, s.error) : null);
  }
  window.WhatsApp = { box: box };
})();
