// Pieces more than one sales dashboard shows: the client header, the contact log, uploads.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const P = {};
  const drafts = {};
  const editing = {};
  const addingBilling = {};
  let listening = null;

  P.SEGMENTS = ['Retail', 'Pro-Retail', 'Projects'];
  P.TRUST = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'].map(function (n) { return [n, n + ' / 10']; });
  P.SOURCES = ['Social media', 'Walk-in', 'Architect reference', 'Referral'];
  P.CONTACT_TYPES = ['Call', 'Meeting', 'WhatsApp', 'Site visit'];
  P.OUTCOMES = ['Spoke to client', 'No answer', 'Asked to call later'];

  P.attach = function (c, key, ctx, label) {
    return Kit.upload(label, c.docs[key], function (file) {
      Kit.store.sendFile(c.id, file).then(function (name) { ctx.update(function () { c.docs[key] = name; }); });
    });
  };

  // Voice note: speaks into the note box. Works in Chrome and Safari.
  function voiceButton(onText) {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path></svg>';
    const b = h('button', { type: 'button', class: 'btn round', 'aria-label': 'Record voice note', title: Speech ? 'Record voice note' : 'Voice notes need Chrome or Safari', disabled: !Speech });
    b.innerHTML = mic;
    if (!Speech) return b;
    b.addEventListener('click', function () {
      if (listening) { listening.stop(); return; }
      const rec = new Speech();
      rec.lang = 'en-IN';
      rec.onresult = function (e) { onText(e.results[0][0].transcript); };
      rec.onend = function () { listening = null; b.classList.remove('rec'); };
      listening = rec;
      b.classList.add('rec');
      rec.start();
    });
    return b;
  }

  // Log a contact. "No answer" starts the retry timer.
  P.contactCard = function (c, ctx) {
    const d = drafts[c.id] = drafts[c.id] || { type: 'Call', outcome: '', next: '', note: '' };
    const note = Kit.input(d.note, function (v) { d.note = v; }, { placeholder: 'Note, or record a voice note', label: 'Note' });
    note.addEventListener('input', function () { d.note = note.value; });
    const last = L.lastSpoke(c);
    return Kit.card('Log a contact', last ? 'Last spoke ' + Kit.day(last) : 'Not spoken yet', 'grey',
      h('div', { class: 'g2' },
        Kit.field('What you did', Kit.select(P.CONTACT_TYPES, d.type, function (v) { d.type = v; }, { placeholder: false })),
        Kit.field('What happened', Kit.select(P.OUTCOMES, d.outcome, function (v) { d.outcome = v; }))),
      Kit.field('Next follow-up', Kit.input(d.next, function (v) { d.next = v; }, { type: 'date' })),
      h('div', { class: 'flexrow' }, h('div', { class: 'grow' }, note), voiceButton(function (text) { d.note = (d.note ? d.note + ' ' : '') + text; note.value = d.note; })),
      Kit.btn('Save', function () {
        if (!d.outcome) { d.msg = 'Choose what happened.'; return ctx.update(); }
        ctx.update(function () { L.logContact(c, { type: d.type, outcome: d.outcome, note: d.note, next: d.next }); delete drafts[c.id]; });
      }, 'line'),
      Kit.warn(d),
      c.retry ? h('div', { class: 'hint' }, 'No answer ' + c.retry.tries + ' time(s). Call again by ' + Kit.dayTime(c.retry.dueAt) + '.') : null,
      c.contacts.slice(0, 3).map(function (e) {
        return h('div', { class: 'hint' }, Kit.dayTime(e.at) + ' · ' + e.type + ' · ' + e.outcome + (e.note ? ' · ' + e.note : ''));
      }));
  };

  // Billing name: chosen, or a new one added, at the moment the token is recorded.
  // The next free billing id for a client. Counted from the highest one in use, so a removed name never lends its id to a new one.
  function nextBillingId(c) {
    const n = c.billing.reduce(function (m, b) { return Math.max(m, Number(String(b.id).split('-').pop()) || 0); }, 0) + 1;
    return 'B-' + c.cid.replace('C-', '') + '-' + n;
  }
  P.billing = function (c, ctx) {
    let box = null;
    if (addingBilling[c.id]) {
      box = Kit.input('', function (v) {
        addingBilling[c.id] = false;
        if (!v.trim()) return ctx.update();
        ctx.update(function () {
          const id = nextBillingId(c);
          c.billing.push({ id: id, name: v.trim() });
          c.billingPick = id;
        });
      }, { placeholder: 'New billing name, then Enter', label: 'New billing name' });
      // Left empty and clicked away: the box goes back to being a button.
      box.addEventListener('blur', function () { if (!box.value.trim() && addingBilling[c.id]) { addingBilling[c.id] = false; ctx.update(); } });
    }
    return h('div', { class: 'flexrow' },
      h('div', { class: 'grow' }, Kit.select(c.billing.map(function (b) { return [b.id, b.name + ' · ' + b.id]; }), c.billingPick, function (v) { ctx.update(function () { c.billingPick = v; }); }, { placeholder: false, label: 'Billing name' })),
      box ? h('div', { class: 'grow' }, box)
        : Kit.btn('Add billing name', function () { addingBilling[c.id] = true; ctx.update(); }, 'small dash'));
  };

  // Personal info: the people on this client, the addresses, and the billing names. Any number of each.
  const draftPerson = {};
  const draftBill = {};
  const billOpen = {};
  P.RELATIONS = ['Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Architect', 'Site in-charge', 'Other'];
  P.personal = function (c, ctx) {
    c.people = c.people || [];
    const dp = draftPerson[c.id] = draftPerson[c.id] || { name: '', relation: '', phone: '' };
    const db = draftBill[c.id] = draftBill[c.id] || { name: '' };
    const set = function (key) { return function (v) { ctx.update(function () { c[key] = v; }); }; };
    return h('section', { class: 'card', style: 'padding: 16px' }, h('div', { class: 'cols' },
      h('div', { class: 'stack' },
        h('b', { class: 'cap2' }, 'Names and phones'),
        h('div', { class: 'line rule' }, h('span', null, h('b', null, c.name), h('span', { class: 'sub' }, ' · main contact')), h('span', { class: 'sub' }, c.phone || 'No phone')),
        c.people.map(function (p, i) {
          return h('div', { class: 'line rule' }, h('span', null, h('b', null, p.name), h('span', { class: 'sub' }, p.relation ? ' · ' + p.relation : '')),
            h('span', { class: 'flexrow' }, h('span', { class: 'sub' }, p.phone || 'No phone'), Kit.btn('Remove', function () { ctx.update(function () { c.people.splice(i, 1); }); }, 'small')));
        }),
        h('div', { class: 'g3' },
          Kit.input(dp.name, function (v) { dp.name = v; }, { placeholder: 'Name', label: 'Name' }),
          Kit.select(P.RELATIONS, dp.relation, function (v) { dp.relation = v; }, { placeholder: 'Relation', label: 'Relation' }),
          Kit.input(dp.phone, function (v) { dp.phone = v; }, { type: 'tel', placeholder: 'Phone', label: 'Phone' })),
        h('div', null, Kit.btn('Add person', function () {
          if (!dp.name.trim()) return;
          ctx.update(function () { c.people.push({ name: dp.name.trim(), relation: dp.relation, phone: dp.phone.trim() }); delete draftPerson[c.id]; });
        }, 'small dash'))),
      h('div', { class: 'stack' },
        h('b', { class: 'cap2' }, 'Addresses'),
        Kit.field('Email', Kit.input(c.email, set('email'), { placeholder: 'Email' })),
        Kit.field('Site address', Kit.input(c.siteAddress, set('siteAddress'), { placeholder: 'House, street, locality, city, PIN' })),
        Kit.field('Site contact on the day', Kit.input(c.siteContact, set('siteContact'), { placeholder: 'Name and phone of the person at site' }))),
      h('div', { class: 'stack' },
        h('b', { class: 'cap2' }, 'Billing names'),
        // Each billing name carries everything an invoice needs. Click one to open it.
        c.billing.map(function (b, i) {
          const open = billOpen[c.id] === b.id;
          const put = function (key) { return function (v) { ctx.update(function () { b[key] = v; }); }; };
          const filled = [b.gst ? 'GST ' + b.gst : '', b.sameAsSite ? 'site address' : (b.address ? 'address added' : '')].filter(Boolean).join(' · ');
          return h('div', { class: 'bill' + (open ? ' open' : '') },
            h('div', { class: 'line' },
              h('button', { type: 'button', class: 'bill-h', 'aria-expanded': open ? 'true' : 'false', onclick: function () { billOpen[c.id] = open ? '' : b.id; ctx.update(); } },
                h('b', null, b.name), h('span', { class: 'sub' }, ' · ' + b.id + (filled ? ' · ' + filled : ' · details not filled'))),
              c.billing.length > 1 ? Kit.btn('Remove', function () { ctx.update(function () { c.billing.splice(i, 1); if (c.billingPick === b.id) c.billingPick = c.billing[0].id; }); }, 'small') : h('span', { class: 'sub' }, 'Main')),
            open ? h('div', { class: 'g2' },
              Kit.field('Billing name', Kit.input(b.name, put('name'))),
              Kit.field('GST number', Kit.input(b.gst, put('gst'), { placeholder: 'If the client has one' })),
              Kit.field('PAN', Kit.input(b.pan, put('pan'))),
              Kit.field('Phone', Kit.input(b.phone, put('phone'), { type: 'tel' })),
              Kit.field('Email for the invoice', Kit.input(b.email, put('email'))),
              Kit.field('State', Kit.input(b.state, put('state'))),
              h('label', { class: 'flexrow', style: 'grid-column: 1 / -1' }, h('input', { type: 'checkbox', checked: !!b.sameAsSite, onchange: function () { ctx.update(function () { b.sameAsSite = !b.sameAsSite; }); } }), 'Billing address is the same as the site address'),
              b.sameAsSite ? null : h('div', { style: 'grid-column: 1 / -1' }, Kit.field('Billing address', Kit.input(b.address, put('address'), { placeholder: 'House, street, locality, city' }))),
              b.sameAsSite ? null : Kit.field('PIN code', Kit.input(b.pin, put('pin')))) : null);
        }),
        h('div', { class: 'flexrow' },
          h('div', { class: 'grow' }, Kit.input(db.name, function (v) { db.name = v; }, { placeholder: 'Another billing name', label: 'Billing name' })),
          Kit.btn('Add', function () {
            if (!db.name.trim()) return;
            ctx.update(function () {
              const id = nextBillingId(c);
              c.billing.push({ id: id, name: db.name.trim() });
              billOpen[c.id] = id;
              delete draftBill[c.id];
            });
          }, 'small dash')))));
  };

  // Name, IDs, the stage strip and "Edit anything".
  P.header = function (c, ctx, tag) {
    const open = editing[c.id];
    const set = function (key) { return function (v) { ctx.update(function () { c[key] = v; }); }; };
    const tools = h('div', { class: 'flexrow' }, Kit.btn(open ? 'Done editing' : 'Edit anything', function () { editing[c.id] = !open; ctx.update(); }, 'small line'));
    const now = L.STAGES.findIndex(function (s) { return s[0] === c.stage; });
    return h('div', { class: 'sheet-h' },
      h('div', { style: 'display:flex; flex-direction:column; gap:6px; min-width:0' },
        h('div', { class: 'flexrow' }, h('h2', null, c.name), tag || null),
        h('div', { class: 'sub', style: 'font-size:13px' }, 'Project ' + c.pid + ' · Customer ' + c.cid + ' · ' + (c.segment || 'Segment not set') + ' · ' + c.source + (c.psm ? ', passed by ' + c.psm : '') + ' · Trust ' + (c.trust ? c.trust + '/10' : 'not set')),
        // The billing name in use, with what it carries, and how many others there are.
        (function () {
          const b = c.billing.find(function (x) { return x.id === c.billingPick; }) || c.billing[0];
          const where = b.sameAsSite ? c.siteAddress : b.address;
          return h('div', { class: 'sub', style: 'font-size: 13px' },
            h('b', { style: 'color: var(--ink)' }, 'Billing: ' + b.name), ' · ' + b.id + (b.gst ? ' · GST ' + b.gst : '') + (b.pan ? ' · PAN ' + b.pan : '') + (where ? ' · ' + where : '') + (c.billing.length > 1 ? ' · +' + (c.billing.length - 1) + ' more billing name(s)' : ''),
            (c.people || []).length ? ' · ' + c.people.length + ' other contact(s)' : '');
        })(),
        tools,
        open ? h('div', { class: 'g4', style: 'margin-top:4px; width: 860px; max-width:100%' },
          Kit.field('Customer name', Kit.input(c.name, set('name'))),
          Kit.field('Phone', Kit.input(c.phone, set('phone'), { type: 'tel' })),
          Kit.field('City', Kit.input(c.city === 'City not set' ? '' : c.city, function (v) { ctx.update(function () { c.city = v.trim() || 'City not set'; }); }, { placeholder: 'City' })),
          Kit.field('Product', Kit.input(c.product, set('product'))),
          Kit.field('Source', Kit.select(P.SOURCES, c.source, set('source'), { placeholder: false })),
          Kit.field('Budget', Kit.input(c.budget, set('budget'))),
          Kit.field('Segment', Kit.select(P.SEGMENTS, c.segment, set('segment'))),
          Kit.field('Trust', Kit.select(P.TRUST, c.trust, set('trust')))) : null),
      h('div', { style: 'display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex:none' },
        Kit.btn('Close', ctx.close, 'small'),
        // Click an earlier stage to go back to that stage's details for this client.
        h('div', { class: 'steps' }, L.STAGES.map(function (s, i) {
          const seeing = (ctx.viewing || c.stage) === s[0];
          if (i > now) return h('span', null, s[1]);
          return h('button', { type: 'button', class: seeing ? 'now' : 'done', 'aria-pressed': seeing ? 'true' : 'false', title: 'See ' + s[1], onclick: function () { ctx.peek(s[0]); } }, s[1]);
        }))));
  };

  window.SalesPieces = P;
})();
