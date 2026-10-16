// Dashboard 1 · Qualified leads. Leads sent by PSM with the layout. Speak to each within 24 hours.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const P = SalesPieces;
  const D = QualifiedDropdowns;
  const view = { psm: '', sort: 'urgent' };
  const drafts = {};

  // Who brought the lead: the PSM, or the SM's own name for a lead they added.
  function sentBy(c) { return c.psm ? 'PSM ' + c.psm : 'SM ' + (c.sm || Sales.me.name); }

  function table(ctx) {
    let rows = ctx.clients.filter(function (c) { return !view.psm || sentBy(c) === view.psm; });
    const psms = ctx.clients.map(sentBy).filter(function (name, i, all) { return all.indexOf(name) === i; }).sort();
    // High priority on top, then medium, then low. Inside each, the most urgent clock first.
    const rank = { High: 0, Medium: 1, Low: 2 };
    const level = function (c) { return rank[c.priority] == null ? 3 : rank[c.priority]; };
    rows.sort(function (a, b) { return (level(a) - level(b)) || (new Date(a.receivedAt) - new Date(b.receivedAt)); });
    const leads = SalesLists.mini('Qualified leads',
      h('div', { style: 'width: 150px' }, Kit.select(psms, view.psm, function (v) { view.psm = v; ctx.update(); }, { placeholder: 'Everyone', label: 'Sent by' })),
      rows.map(function (c) {
        const clock = L.clock(c);
        return { id: c.id, name: c.name, priority: c.priority, sub: sentBy(c) + ' · ' + c.city + ' · ' + c.product, pill: Kit.pill(clock[0], clock[1]), on: ctx.isOpen && ctx.selected && ctx.selected.id === c.id, pick: function () { ctx.select(c.id); } };
      }), 'No qualified leads right now.', SalesBin.clients(ctx));

    return h('div', { class: 'twolists' }, leads, SalesLists.followUps(ctx));
  }

  function sheet(c, ctx) {
    const v = c.validation;
    const d = drafts[c.id] = drafts[c.id] || { outcome: '', next: '', note: '', reason: '' };
    const setC = function (key) { return function (val) { ctx.update(function () { c[key] = val; }); }; };
    const setV = function (key) { return function (val) { ctx.update(function () { v[key] = val; }); }; };
    const clock = L.clock(c);
    // Once the client has moved on, this screen is still where their details live, but it can no longer accept or disqualify.
    const live = c.stage === 'qualified';
    const note = Kit.input(d.note, function (val) { d.note = val; }, { placeholder: 'Note from the call, typed or spoken', label: 'Note' });
    note.addEventListener('input', function () { d.note = note.value; });
    // Speak the note: the browser writes down what is said and adds it to the box.
    const mic = P.voice(function (text) { d.note = (d.note ? d.note + ' ' : '') + text; note.value = d.note; });

    const fromPsm = h('div', { class: 'soft' },
      h('b', { style: 'font-size: 12px; color: var(--ink2)' }, c.psm ? 'From PSM ' + c.psm : 'Added by ' + sentBy(c)),
      h('div', { class: 'g2' },
        Kit.field('Phone', Kit.input(c.phone, setC('phone'), { type: 'tel', placeholder: 'Add phone' })),
        Kit.field('Budget given', Kit.input(c.budget, setC('budget'))),
        Kit.field('Site type', Kit.select(D.siteType, c.siteType, setC('siteType'))),
        Kit.field('Received', h('div', { style: 'min-height: 38px; display: flex; align-items: center' }, Kit.dayTime(c.receivedAt)))),
      h('div', { class: 'line' }, h('span', null, 'Layout', c.docs.layout ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, c.docs.layout)) : null), P.attach(c, 'layout', ctx)),
      Kit.field('PSM note', Kit.input(c.note, setC('note'))));

    const YESNO = ['Yes', 'No'];
    // The answer is shown as Yes or No whatever longer wording an older record carries.
    const yn = function (val) { return !val ? '' : (/^yes/i.test(val) ? 'Yes' : 'No'); };
    // A lead marked not valid needs nothing else: only why. Everything else on the form goes away.
    const invalid = yn(v.valid) === 'No';
    const notValid = h('div', { style: 'display: flex; flex-direction: column; gap: 12px' },
      h('div', { class: 'soft' },
        h('b', { style: 'font-size: 12px; color: var(--ink2)' }, 'PSM quality'),
        h('div', { style: 'max-width: 260px' }, Kit.field('Is this lead valid?', Kit.choice(YESNO, 'No', setV('valid'), 'Is this lead valid?'))),
        Kit.field('Why is it not valid? The reason for not buying Magppie', Kit.input(v.invalidReason, setV('invalidReason'), { placeholder: 'For example: budget too low, only enquiring, bought elsewhere', style: 'height: 46px' })),
        live ? h('div', { class: 'flexrow' },
          Kit.btn('Disqualify this lead', function () {
            if (!(v.invalidReason || '').trim()) { d.msg = 'Write the reason first.'; return ctx.update(); }
            ctx.update(function () { c.stage = 'lost'; c.lostReason = v.invalidReason.trim(); c.lostAt = Kit.now(); });
          }, 'warn'),
          h('span', { class: 'sub' }, 'Changed your mind? Press Yes above and the full form comes back.')) : null,
        Kit.warn(d)));
    const validation = invalid ? notValid : h('div', { style: 'display: flex; flex-direction: column; gap: 12px' },
      Architects.forClient(c, ctx),
      // 1 · PSM quality: was this a good lead from the PSM? Yes or no, one tap each.
      h('div', { class: 'soft' },
        h('b', { style: 'font-size: 12px; color: var(--ink2)' }, 'PSM quality'),
        h('div', { class: 'g3' },
          Kit.field('Is this lead valid?', Kit.choice(YESNO, yn(v.valid), setV('valid'), 'Is this lead valid?')),
          Kit.field('Layout correct?', Kit.choice(YESNO, yn(v.layout), setV('layout'), 'Layout correct?')),
          Kit.field('Budget confirmed?', Kit.choice(YESNO, yn(v.budget), setV('budget'), 'Budget confirmed?')))),
      // 2 · Basic info: what the sales person learns on the call.
      h('div', { class: 'soft' },
        h('b', { style: 'font-size: 12px; color: var(--ink2)' }, 'Basic info'),
        h('div', { class: 'g3' },
          Kit.field('Segment', Kit.select(P.SEGMENTS, c.segment, setC('segment'))),
          Kit.field('Kitchen type', Kit.select(D.kitchenType, v.kitchenType, setV('kitchenType'))),
          Kit.field('Design theme', Kit.select(D.designTheme, v.theme, setV('theme'))),
          Kit.field('Priority prospect', Kit.select(D.priority, c.priority, setC('priority'))),
          Kit.field('Trust', Kit.select(P.TRUST, c.trust, setC('trust'))))),
      h('div', { class: 'g2' },
        Kit.field('Call result', Kit.select(Kit.outcomes(D.callResult), d.outcome, function (val) { d.outcome = val; })),
        Kit.field('Next follow-up · date and time', Kit.input(d.next, function (val) { d.next = val; }, { type: 'datetime-local' }))),
      h('div', { class: 'flexrow' },
        h('div', { class: 'grow' }, note),
        mic,
        Kit.btn('Save call', function () {
          if (!d.outcome) { d.msg = 'Choose the call result first.'; return ctx.update(); }
          ctx.update(function () { L.logContact(c, { type: 'Call', outcome: d.outcome, note: d.note, next: d.next }); delete drafts[c.id]; });
        }, 'line'),
        live ? Kit.btn('Accept and start DRF', function () {
          if (!c.spokeAt) { d.msg = 'Speak to the client first. Save a call with "Spoke to client".'; return ctx.update(); }
          ctx.update(function () {
            c.stage = 'design'; c.design.step = 'drf'; c.design.stepAt = Kit.now(); c.acceptedAt = Kit.now();
            // What was picked on the call goes into the DRF, so it is not asked twice.
            const b = c.design.brief;
            if (v.kitchenType && !b.kitchenType.length) b.kitchenType.push(v.kitchenType);
            if (v.theme && !b.theme) b.theme = v.theme;
            // A client with several orders is accepted once: every order moves on, each to its own DRF.
            P.orders(c, ctx).forEach(function (o) {
              if (o.id === c.id || o.stage !== 'qualified') return;
              o.stage = 'design'; o.design.step = 'drf'; o.design.stepAt = Kit.now(); o.acceptedAt = Kit.now(); o.spokeAt = o.spokeAt || c.spokeAt;
            });
          });
          ctx.open(c);
        }, 'dark') : null),
      !live ? null : h('div', { class: 'flexrow' },
        h('div', { class: 'grow' }, Kit.input(d.reason, function (val) { d.reason = val; }, { placeholder: 'Reason, only if you disqualify', label: 'Disqualify reason' })),
        Kit.btn('Disqualify', function () {
          if (!d.reason.trim()) { d.msg = 'Write the reason to disqualify.'; return ctx.update(); }
          ctx.update(function () { c.stage = 'lost'; c.lostReason = d.reason.trim(); c.lostAt = Kit.now(); });
        }, 'warn')),
      Kit.warn(d),
      c.contacts.slice(0, 3).map(function (e) { return h('div', { class: 'hint' }, Kit.dayTime(e.at) + ' · ' + Kit.outcome(e.outcome) + (e.note ? ' · ' + e.note : '')); }));

    return [
      P.header(c, ctx, [c.priority ? h('i', { class: 'heat ' + c.priority.toLowerCase() }, c.priority) : null, Kit.pill(clock[0], clock[1])]),
      h('div', { class: 'flexrow' },
        c.phone ? h('a', { class: 'btn dark', href: 'tel:' + c.phone, style: 'display: inline-flex; align-items: center; color: #FFFFFF' }, 'Call now') : null,
        h('span', { class: 'hint' }, c.city + ' · ' + c.product)),
      h('section', { class: 'card', style: 'padding: 16px' }, h('div', { class: 'cols2' }, fromPsm, validation)),
      P.personal(c, ctx)
    ];
  }

  Sales.register({ id: 'qualified', title: 'Qualified leads', short: 'Leads', table: table, sheet: sheet,
    summary: function (list) {
      const open = list.filter(function (c) { return !c.spokeAt; });
      const late = open.filter(function (c) { return L.firstCall(c).late; }).length;
      const high = list.filter(function (c) { return c.priority === 'High'; }).length;
      return open.length + ' to call · ' + late + ' past 24h · ' + high + ' high priority';
    } });
})();
