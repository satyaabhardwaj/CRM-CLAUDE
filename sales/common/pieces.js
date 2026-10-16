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

  // Voice note. Press the microphone, speak, press again: the recording goes to the transcriber agent (ai/agents/transcriber.py),
  // an AI model writes down the words, and they land in the box. It understands Hindi, English and the two mixed.
  // If it cannot work, it says why in plain words under the button. It never fails silently.
  function voiceButton(onText) {
    const mic = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path></svg>';
    const b = h('button', { type: 'button', class: 'btn round', 'aria-label': 'Record voice note', title: 'Record a voice note. Press again to stop.' });
    b.innerHTML = mic;
    const say = function (text) {
      let tip = b.parentNode && b.parentNode.querySelector('.mic-says');
      if (!text) { if (tip) tip.remove(); return; }
      if (!tip) { tip = h('span', { class: 'mic-says', role: 'status' }); b.after(tip); }
      tip.textContent = text;
    };
    let rec = null;
    b.addEventListener('click', function () {
      if (rec) { rec.stop(); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) return say('This browser cannot record. Open the CRM in Chrome or Safari.');
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        const chunks = [];
        rec = new MediaRecorder(stream);
        rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          const sound = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          rec = null; b.classList.remove('rec');
          if (!sound.size) return say('Nothing was recorded. Try again.');
          say('Writing it down…');
          fetch('/api/ai/transcribe', { method: 'POST', headers: { 'Content-Type': sound.type }, body: sound })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (out) {
              if (out.text) { say(''); return onText(out.text); }
              say(out.error === 'no key' ? 'Voice to text is not switched on yet. It needs a key in the ai folder.' : (out.error || 'Could not write it down. Try again.'));
            }, function () { say('Voice to text works on the laptop copy only.'); });
        };
        rec.start(); b.classList.add('rec'); say('Recording… press again to stop.');
      }, function () { say('The microphone is blocked. Allow it for this page in the browser, then try again.'); });
    });
    return b;
  }
  P.voice = voiceButton;

  // Log a contact. "No answer" starts the retry timer.
  P.contactCard = function (c, ctx) {
    const d = drafts[c.id] = drafts[c.id] || { type: 'Call', outcome: '', next: '', note: '' };
    const note = Kit.input(d.note, function (v) { d.note = v; }, { placeholder: 'Note, or record a voice note', label: 'Note' });
    note.addEventListener('input', function () { d.note = note.value; });
    const last = L.lastSpoke(c);
    return Kit.card('Log a contact', last ? 'Last spoke ' + Kit.day(last) : 'Not spoken yet', 'grey',
      h('div', { class: 'g2' },
        Kit.field('What you did', Kit.select(P.CONTACT_TYPES, d.type, function (v) { d.type = v; }, { placeholder: false })),
        Kit.field('What happened', Kit.select(Kit.outcomes(P.OUTCOMES), d.outcome, function (v) { d.outcome = v; }))),
      Kit.field('Next follow-up · date and time', Kit.input(d.next, function (v) { d.next = v; }, { type: 'datetime-local' })),
      h('div', { class: 'flexrow' }, h('div', { class: 'grow' }, note), voiceButton(function (text) { d.note = (d.note ? d.note + ' ' : '') + text; note.value = d.note; })),
      Kit.btn('Save', function () {
        if (!d.outcome) { d.msg = 'Choose what happened.'; return ctx.update(); }
        ctx.update(function () { L.logContact(c, { type: d.type, outcome: d.outcome, note: d.note, next: d.next }); delete drafts[c.id]; });
      }, 'line'),
      Kit.warn(d),
      c.retry ? h('div', { class: 'hint' }, 'RNR ' + c.retry.tries + ' time(s). Call again by ' + Kit.dayTime(c.retry.dueAt) + '.') : null,
      c.contacts.slice(0, 3).map(function (e) {
        return h('div', { class: 'hint' }, Kit.dayTime(e.at) + ' · ' + e.type + ' · ' + Kit.outcome(e.outcome) + (e.note ? ' · ' + e.note : ''));
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

  // Several orders for one client (two floors, two kitchens). Each order is its own row with its own DRF, proposals
  // and money, and they all carry the same project ID and customer ID. `groupId` ties them together.
  P.orders = function (c, ctx) { return c.groupId ? ctx.everyone.filter(function (x) { return x.groupId === c.groupId && x.stage !== 'bin'; }) : [c]; };
  const draftOrder = {};
  const STAGE_NAME = { qualified: 'Qualified', design: 'In design', booked: 'Booked', post: 'Post-design', lost: 'Disqualified' };
  // The first order usually carries the client's own name; then the row is just that name, not "saty · saty".
  function label(c, orderName) { c.orderName = orderName; c.name = orderName.toLowerCase() === String(c.person).toLowerCase() ? c.person : c.person + ' · ' + orderName; }
  // An email is optional for every contact. It stays behind a small "Email" button until someone wants to add one.
  const emailOpen = {};
  function emailBtn(key, has, ctx) {
    return Kit.btn(has ? 'Email ✓' : 'Email', function () { emailOpen[key] = !emailOpen[key]; ctx.update(); }, 'small' + (emailOpen[key] ? ' line' : ''));
  }
  function emailRow(key, value, onChange) {
    return emailOpen[key] ? Kit.input(value, onChange, { placeholder: 'Email', label: 'Email' }) : null;
  }
  // A small button that uploads this order's layout. It shows a tick once a layout is there.
  function layoutBtn(owner, current, onName) {
    const pick = h('input', { type: 'file', style: 'display:none', onchange: function () { if (pick.files[0]) Kit.store.sendFile(owner, pick.files[0]).then(onName); } });
    return h('span', { class: 'flexrow', title: current || 'No layout uploaded yet' }, Kit.btn(current ? 'Layout ✓' : 'Layout', function () { pick.click(); }, 'small'), pick);
  }
  const addOrderOpen = {};
  const unticking = {};
  function ordersBox(c, ctx) {
    if (c.segment !== 'Retail' && !c.multi) return null;
    const all = P.orders(c, ctx);
    const d = draftOrder[c.id] = draftOrder[c.id] || { id: 'c' + Date.now(), name: '', phone: '', layout: '' };
    // An order that is removed goes to the Bin, like any deleted client, and can be restored from there.
    const bin = function (o) { o.binned = { at: Kit.now(), stage: o.stage }; o.stage = 'bin'; };
    const single = function (o) { o.multi = false; o.name = o.person || o.name; delete o.orderName; delete o.groupId; delete o.oneContact; };
    const tick = h('label', { class: 'flexrow' }, h('input', { type: 'checkbox', checked: !!c.multi, onchange: function () {
      if (c.multi && all.length > 1) { unticking[c.id] = true; return ctx.update(); }
      ctx.update(function () {
        if (c.multi) return single(c);
        c.multi = true; c.groupId = c.id; c.person = c.name; label(c, c.name);
      });
    } }), 'Multiple orders');
    if (!c.multi) return h('div', null, tick);
    const one = h('label', { class: 'flexrow' }, h('input', { type: 'checkbox', checked: !!c.oneContact, onchange: function () {
      ctx.update(function () { const on = !c.oneContact; all.forEach(function (o) { o.oneContact = on; if (on) o.phone = c.phone; }); });
    } }), 'One main contact for all');
    const open = addOrderOpen[c.id];
    return h('div', { class: 'stack' },
      h('div', { class: 'line' }, tick, one),
      // Unticking with more than one order: say what will happen, and let the person choose.
      !unticking[c.id] ? null : h('div', { class: 'soft' },
        h('div', null, 'This keeps "' + c.orderName + '" as the only order and moves the other ' + (all.length - 1) + ' to the Bin. They can be restored from the Bin.'),
        h('div', { class: 'flexrow' },
          Kit.btn('Keep only this order', function () { unticking[c.id] = false; ctx.update(function () { all.forEach(function (o) { if (o.id !== c.id) bin(o); }); single(c); }); }, 'small warn'),
          Kit.btn('Cancel', function () { unticking[c.id] = false; ctx.update(); }, 'small'))),
      // One line per order: name, phone, email and layout. To open another order, use its button under the client's name.
      all.map(function (o) {
        const key = 'o' + o.id;
        return h('div', { class: 'stack', style: 'gap: 6px' },
          h('div', { class: 'flexrow' },
            h('span', { style: 'flex: 1.2; min-width: 0' }, Kit.input(o.orderName, function (v) { ctx.update(function () { label(o, v.trim() || 'Order'); }); }, { label: 'Order name', placeholder: 'Order name' })),
            c.oneContact ? null : h('span', { style: 'flex: 1; min-width: 0' }, Kit.input(o.phone, function (v) { ctx.update(function () { o.phone = v.trim(); }); }, { type: 'tel', label: 'Phone of ' + o.orderName, placeholder: 'Phone' })),
            c.oneContact ? null : emailBtn(key, o.email, ctx),
            layoutBtn(o.id, o.docs.layout, function (name) { ctx.update(function () { o.docs.layout = name; }); }),
            all.length < 2 ? null : Kit.btn('Remove', function () {
              const other = all.filter(function (x) { return x.id !== o.id; })[0];
              ctx.update(function () { bin(o); });
              // Removing the order you are on takes you to one that is left.
              if (o.id === c.id && other) { if (other.stage === 'post') ctx.goTo('tracker', other); else ctx.open(other); }
            }, 'small')),
          c.oneContact ? null : emailRow(key, o.email, function (v) { ctx.update(function () { o.email = v.trim(); }); }));
      }),
      !open ? h('div', null, Kit.btn('Add order', function () { addOrderOpen[c.id] = true; ctx.update(); }, 'small dash'))
        : h('div', { class: 'flexrow' },
            h('span', { style: 'flex: 1.2; min-width: 0' }, Kit.input(d.name, function (v) { d.name = v; }, { placeholder: 'New order name', label: 'New order name' })),
            c.oneContact ? null : h('span', { style: 'flex: 1; min-width: 0' }, Kit.input(d.phone, function (v) { d.phone = v; }, { type: 'tel', placeholder: 'Phone', label: 'New order phone' })),
            layoutBtn(d.id, d.layout, function (name) { d.layout = name; ctx.update(); }),
            Kit.btn('Add', function () {
              if (!d.name.trim()) return;
              const copy = JSON.parse(JSON.stringify(c));
              copy.id = d.id;
              if (d.phone.trim()) copy.phone = d.phone.trim();
              if (!c.oneContact) copy.email = '';
              label(copy, d.name.trim());
              // The new order starts clean: its own DRF, its own proposals, its own money. The people and addresses come along.
              copy.stage = c.stage === 'qualified' ? 'qualified' : 'design';
              copy.design = { brief: { kitchenType: [] }, proposals: [], revisions: [], step: 'drf', stepAt: Kit.now() };
              copy.order = { products: [] }; copy.payment = { plan: c.payment.plan, receipts: [] };
              copy.approvals = { plan: 'Not sent', timeline: 'Not sent', booking: 'Not sent' };
              copy.timeline = { type: 'Standard', productionDays: 45, custom: {} };
              copy.docs = d.layout ? { layout: d.layout } : {};
              copy.news = []; copy.nextFollowUp = ''; copy.retry = null;
              ['measurement', 'timelineChanges', 'approvalNotes', 'submittedAt', 'bookedAt', 'approvedAt', 'ocfAt', 'ocfAsked', 'recordingText', 'binned', 'binnedCall'].forEach(function (k) { delete copy[k]; });
              delete draftOrder[c.id]; addOrderOpen[c.id] = false;
              ctx.update(function () { ctx.add(copy); });
            }, 'small dark'),
            Kit.btn('Cancel', function () { addOrderOpen[c.id] = false; ctx.update(); }, 'small')));
  }

  // Personal info: the people on this client, the addresses, and the billing names. Any number of each.
  const draftPerson = {};
  const addPersonOpen = {};
  const draftBill = {};
  const billOpen = {};
  P.RELATIONS = ['Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Architect', 'Site in-charge', 'Other'];
  P.personal = function (c, ctx) {
    c.people = c.people || [];
    const dp = draftPerson[c.id] = draftPerson[c.id] || { name: '', relation: '', phone: '' };
    const db = draftBill[c.id] = draftBill[c.id] || { name: '' };
    const set = function (key) { return function (v) { ctx.update(function () { c[key] = v; }); }; };
    return h('section', { class: 'card', style: 'padding: 16px' }, h('div', { class: 'cols', style: 'grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr)' },
      h('div', { class: 'stack' },
        h('b', { class: 'cap2' }, 'Names and phones'),
        // The main contact. With several orders each order carries its own name and phone, so this row goes away,
        // unless "One main contact for all" is ticked.
        c.multi && !c.oneContact ? null : h('div', { class: 'flexrow' },
          h('span', { style: 'flex: 1.2; min-width: 0' }, Kit.input(c.person || c.name, function (v) {
            const name = v.trim(); if (!name) return ctx.update();
            ctx.update(function () {
              if (!c.multi) { c.name = name; return; }
              P.orders(c, ctx).forEach(function (o) { const own = String(o.orderName).toLowerCase() === String(o.person).toLowerCase(); o.person = name; label(o, own ? name : o.orderName); });
            });
          }, { placeholder: 'Main contact name', label: 'Main contact' })),
          h('span', { style: 'flex: 1; min-width: 0' }, Kit.input(c.phone, function (v) {
            ctx.update(function () { (c.multi ? P.orders(c, ctx) : [c]).forEach(function (o) { o.phone = v.trim(); }); });
          }, { type: 'tel', placeholder: 'Phone', label: 'Phone' })),
          emailBtn('m' + c.id, c.email, ctx)),
        c.multi && !c.oneContact ? null : emailRow('m' + c.id, c.email, function (v) { ctx.update(function () { (c.multi ? P.orders(c, ctx) : [c]).forEach(function (o) { o.email = v.trim(); }); }); }),
        c.people.map(function (p, i) {
          const key = 'p' + c.id + i;
          return h('div', { class: 'stack', style: 'gap: 6px' },
            h('div', { class: 'line' }, h('span', null, h('b', null, p.name), h('span', { class: 'sub' }, (p.relation ? ' · ' + p.relation : '') + (p.phone ? ' · ' + p.phone : ''))),
              h('span', { class: 'flexrow' }, emailBtn(key, p.email, ctx), Kit.btn('Remove', function () { ctx.update(function () { c.people.splice(i, 1); }); }, 'small'))),
            emailRow(key, p.email, function (v) { ctx.update(function () { p.email = v.trim(); }); }));
        }),
        !addPersonOpen[c.id] ? h('div', null, Kit.btn('Add person', function () { addPersonOpen[c.id] = true; ctx.update(); }, 'small dash'))
          : h('div', { class: 'flexrow' },
              h('span', { style: 'flex: 1.2; min-width: 0' }, Kit.input(dp.name, function (v) { dp.name = v; }, { placeholder: 'Name', label: 'Name' })),
              h('span', { style: 'flex: 1; min-width: 0' }, Kit.select(P.RELATIONS, dp.relation, function (v) { dp.relation = v; }, { placeholder: 'Relation', label: 'Relation' })),
              h('span', { style: 'flex: 1; min-width: 0' }, Kit.input(dp.phone, function (v) { dp.phone = v; }, { type: 'tel', placeholder: 'Phone', label: 'Phone' })),
              Kit.btn('Add', function () {
                if (!dp.name.trim()) return;
                ctx.update(function () { c.people.push({ name: dp.name.trim(), relation: dp.relation, phone: dp.phone.trim() }); delete draftPerson[c.id]; addPersonOpen[c.id] = false; });
              }, 'small dark'),
              Kit.btn('Cancel', function () { addPersonOpen[c.id] = false; ctx.update(); }, 'small')),
        ordersBox(c, ctx)),
      h('div', { class: 'stack' },
        h('b', { class: 'cap2' }, 'Addresses'),
        Kit.field('Site address', Kit.input(c.siteAddress, set('siteAddress'), { placeholder: 'House, street, locality', style: 'height: 46px' })),
        // Type the PIN code and the state fills in at once; the city follows when the PIN service answers.
        h('div', { class: 'g3' },
          Kit.field('PIN code', Kit.input(c.sitePin, function (v) {
            const pin = v.replace(/[^0-9]/g, '').slice(0, 6);
            ctx.update(function () { c.sitePin = pin; if (Pin.ok(pin) && Pin.state(pin)) c.siteState = Pin.state(pin); });
            Pin.lookup(pin).then(function (found) {
              if (!found || c.sitePin !== pin) return;
              ctx.update(function () { if (found.city) c.city = found.city; if (found.state) c.siteState = found.state; });
            });
          }, { placeholder: '6 digits', label: 'PIN code' })),
          Kit.field('City', Kit.input(c.city === 'City not set' ? '' : c.city, function (v) { ctx.update(function () { c.city = v.trim() || 'City not set'; }); }, { placeholder: 'Fills from the PIN' })),
          Kit.field('State', Kit.input(c.siteState, set('siteState'), { placeholder: 'Fills from the PIN' }))),
        c.sitePin && !Pin.ok(c.sitePin) ? h('div', { class: 'msg' }, 'A PIN code has 6 digits.') : null,
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

  // Everything known about one client, as sections for a PDF.
  P.report = function (c) {
    const t = L.totals(c), d = L.dates(c), b = c.design.brief, pick = c.billing.find(function (x) { return x.id === c.billingPick; }) || c.billing[0];
    const day = function (v) { return v ? Kit.day(v) : ''; };
    const stage = { qualified: 'Qualified lead', design: 'In design', booked: 'Booked, collecting', post: 'Post-design', lost: 'Disqualified', bin: 'In the bin' }[c.stage] || c.stage;
    return [
      { heading: 'Client', rows: [['Name', c.name], ['Project ID', c.pid], ['Customer ID', c.cid], ['Stage', stage], ['Phone', c.phone], ['City', c.city], ['Email', c.email], ['Site address', [c.siteAddress, c.sitePin, c.siteState].filter(Boolean).join(', ')],
        ['Product', c.product], ['Source', c.source + (c.psm ? ', passed by ' + c.psm : '')], ['Segment', c.segment], ['Priority', c.priority], ['Trust', c.trust ? c.trust + '/10' : ''], ['Budget given', c.budget],
        ['Sales person', People.owner(c)], ['Designer', c.design.designer], ['Lead received', day(c.receivedAt)], ['First conversation', day(c.spokeAt)], ['Next follow-up', c.nextFollowUp ? Kit.when(c.nextFollowUp) : ''], ['Note', c.note]] },
      { heading: 'Billing', rows: c.billing.map(function (x) { return [x.id + (x.id === pick.id ? ' (in use)' : ''), [x.name, x.gst ? 'GST ' + x.gst : '', x.pan ? 'PAN ' + x.pan : '', x.sameAsSite ? c.siteAddress : x.address].filter(Boolean).join(', ')]; })
        .concat((c.people || []).map(function (p) { return ['Other contact', [p.name, p.relation, p.phone].filter(Boolean).join(', ')]; })) },
      !t.total ? null : { heading: 'Order', rows: [['Kitchen' + (Kit.bankOnly() ? '' : ' (offer basic value)'), Kit.money(t.base)]].concat(Kit.bankOnly() ? [] : [['Management discount, no GST', Kit.money(t.md)]]).concat([['Bank amount before GST', Kit.money(t.bankBase)], ['GST 18% on the bank amount', Kit.money(t.tax)],
        ['In bank, with GST', Kit.money(t.bank)]]).concat(Kit.bankOnly() ? [] : [['Freight, loading and unloading', Kit.money(t.freight)]]).concat([['Total payable by client', Kit.money(t.total)], ['Payment plan', L.PLANS[c.payment.plan].label]]) },
      !t.total ? null : { heading: 'Money', rows: L.ledger(c).map(function (s) { return [s.name + ' ' + s.percent + '%', Kit.money(s.amount) + ' - paid ' + Kit.money(s.paid) + ', left ' + Kit.money(s.due)]; })
        .concat([['Received so far', Kit.money(L.collected(c)) + ' (' + Math.round(L.collected(c) / t.total * 100) + '% of the order)'], ['Booking amount left', Kit.money(L.bookingLeft(c))], ['Rest of booking amount by', day(c.payment.expectedBy)]])
        .concat(c.payment.receipts.map(function (r) { return ['Payment ' + day(r.date), Kit.money(r.amount) + ' - ' + (r.mode || 'mode not set') + ' - ' + (r.status === 'Requested' ? 'with Accounts' : r.status) + (r.reason ? ' (' + r.reason + ')' : '')]; })) },
      !d ? null : { heading: 'Timeline', rows: [['Timeline', c.timeline.type + ', ' + c.timeline.productionDays + ' production days'], ['Booked on', day(c.bookedAt)], ['OCF date', day(c.ocfAt)], ['Drawing signoff', day(d.signoff)], ['PDI', day(d.pdi)], ['Dispatch', day(d.dispatch)], ['Pooja / handover', day(d.handover)]]
        .concat((c.timelineChanges || []).map(function (x) { return ['Changed by ' + x.by + ' on ' + day(x.at), 'Handover ' + day(x.before.handover) + ' to ' + day(x.after.handover)]; })) },
      { heading: 'Approvals', rows: [['Payment plan', c.approvals.plan], ['Timeline (Design)', c.approvals.timeline], ['Booking (Accounts)', c.approvals.booking], ['Site measurement', c.measurement ? 'Requested ' + day(c.measurement.requestedAt) + (c.measurement.date ? ', visit ' + day(c.measurement.date) : '') : 'Not requested']] },
      { heading: 'Design', rows: [['Design presentation', b.presentation], ['Design theme', b.theme], ['Kitchen type', b.kitchenType.join(', ')], ['Room / area', b.room], ['Ceiling height (mm)', b.ceilingHeight], ['Kitchen height (mm)', b.kitchenHeight],
        ['Island', b.island], ['Gas', b.gas], ['Vastu', b.vastu], ['Design required on', day(b.requiredOn)], ['Notes', b.notes]].filter(function (r) { return r[1]; })
        .concat(c.design.proposals.map(function (p) { return ['Proposal V' + p.v, Kit.money(p.amount) + ' - from Design ' + day(p.receivedAt) + ' - ' + p.status]; }))
        .concat(c.design.revisions.map(function (r) { return ['Revision of V' + r.ofVersion, r.reason + (r.notes ? ' - ' + r.notes : '') + ' (' + day(r.at) + ')']; })) },
      { heading: 'Documents', rows: [['Signed quotation', c.docs.quotation], ['Signed drawing', c.docs.drawing], ['Screenshot', c.docs.screenshot], ['Recorded message', c.docs.recording], ['DRF and drawings', c.docs.drf], ['House layout', c.docs.layout]].filter(function (r) { return r[1]; }) },
      { heading: 'Calls and meetings', rows: c.contacts.slice(0, 40).map(function (e) { return [Kit.dayTime(e.at), [e.type, Kit.outcome(e.outcome), e.note, e.next ? 'next ' + Kit.when(e.next) : ''].filter(Boolean).join(' - ')]; }) }
    ];
  };
  P.pdf = function (c) {
    Kit.pdf(c.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + c.pid + '.pdf', c.name, 'Project ' + c.pid + ' · Customer ' + c.cid + ' · ' + People.owner(c), P.report(c));
  };

  // Name, IDs, the stage strip and "Edit anything".
  P.header = function (c, ctx, tag) {
    const open = editing[c.id];
    const set = function (key) { return function (v) { ctx.update(function () { c[key] = v; }); }; };
    const tools = h('div', { class: 'flexrow' }, Kit.btn(open ? 'Done editing' : 'Edit anything', function () { editing[c.id] = !open; ctx.update(); }, 'small line'),
      window.jspdf ? Kit.btn('Download PDF', function () { P.pdf(c); }, 'small line') : null,
      window.WhatsApp ? WhatsApp.button(c, ctx) : null);
    const now = L.STAGES.findIndex(function (s) { return s[0] === c.stage; });
    return h('div', { class: 'sheet-h' },
      h('div', { style: 'display:flex; flex-direction:column; gap:6px; min-width:0' },
        h('div', { class: 'flexrow' }, h('h2', null, c.name), tag || null,
          null),
        // One button per order of this client. Click a name to see that order's DRF and everything else of it.
        c.multi && P.orders(c, ctx).length > 1 ? h('div', { class: 'ordertabs', role: 'tablist', 'aria-label': 'Orders of this client' }, P.orders(c, ctx).map(function (o) {
          return h('button', { type: 'button', role: 'tab', class: o.id === c.id ? 'on' : '', 'aria-selected': o.id === c.id ? 'true' : 'false', title: STAGE_NAME[o.stage] || o.stage, onclick: function () {
            if (o.id === c.id) return;
            if (o.stage === 'post') ctx.goTo('tracker', o); else ctx.open(o);
          } }, h('b', null, o.orderName), h('small', null, STAGE_NAME[o.stage] || o.stage));
        })) : null,
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
