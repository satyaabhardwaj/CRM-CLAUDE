// Dashboard 2 · In design. DRF goes to Design, proposals come back, the client approves or asks for changes.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const P = SalesPieces;
  const D = InDesignDropdowns;
  const ui = {};

  // Where a client is inside this stage, and whose move it is.
  const STEPS = {
    drf: ['Send DRF to Design', 'grey', 'You'],
    withDesign: ['Pending with designer', 'blue', 'Design'],
    toShare: ['Share proposal with client', 'grey', 'You'],
    withClient: ['Waiting for client', 'blue', 'Client']
  };
  function latest(c) { return c.design.proposals[c.design.proposals.length - 1]; }
  // An architect is part of the decision when the lead came through one, or when the SM ticks the box.
  function hasArchitect(c) { return c.architectInvolved != null ? c.architectInvolved : c.source === 'Architect reference'; }

  const view = { step: '' };

  function table(ctx) {
    // Just in from Design first, then your moves, then the ones waiting on someone else.
    const rank = function (c) { return c.design.newProposal ? 0 : ((STEPS[c.design.step] || STEPS.drf)[2] === 'You' ? 1 : 2); };
    const rows = ctx.clients.filter(function (c) { return !view.step || (c.design.step || 'drf') === view.step; })
      .sort(function (a, b) { return (rank(a) - rank(b)) || (new Date(a.design.stepAt || 0) - new Date(b.design.stepAt || 0)); });
    const times = function (n) { return n + (n === 1 ? ' time' : ' times'); };
    const proposals = Kit.list('Proposals',
      h('div', { style: 'width: 190px' }, Kit.select(Object.keys(STEPS).map(function (k) { return [k, STEPS[k][0]]; }), view.step, function (v) { view.step = v; ctx.update(); }, { placeholder: 'Every step', label: 'Step' })),
      rows.map(function (c) {
        const fresh = c.design.step === 'toShare' && c.design.newProposal;
        const step = fresh ? ['Just in from Design', 'green'] : (STEPS[c.design.step] || STEPS.drf);
        const p = latest(c);
        const came = c.design.proposals.length;
        const edits = c.design.revisions.length;
        return { id: c.id, name: c.name,
          sub: (p ? 'V' + p.v + ' · ' + Kit.short(p.amount) + ' · came ' + times(came) + ' · revised ' + times(edits) : 'No proposal yet') + ' · ' + Kit.daysSince(c.design.stepAt) + ' day(s)',
          pill: Kit.pill(step[0], step[1]), mark: fresh ? 'new' : (edits >= 2 ? 'warn' : ''),
          on: ctx.isOpen && ctx.selected && ctx.selected.id === c.id, pick: function () { ctx.select(c.id); } };
      }), 'No clients in design right now.', SalesBin.clients(ctx));
    return h('div', { class: 'twolists' }, SalesLists.followUps(ctx, 'design', 'Calls and follow-ups'), proposals);
  }

  // The DRF (design briefing). Filled here, the same fields as the form in Zoho. Starred fields are a must.
  const MUST = [['presentation', 'Design presentation'], ['theme', 'Design theme'], ['ceilingHeight', 'Ceiling height'], ['kitchenHeight', 'Kitchen height'],
    ['island', 'Island required'], ['gas', 'Gas arrangement'], ['vastu', 'Vastu requirement'], ['requiredOn', 'Design required on'], ['room', 'Room / area name']];
  function missing(c) {
    const b = c.design.brief;
    const list = MUST.filter(function (m) { return !b[m[0]]; }).map(function (m) { return m[1]; });
    if (!b.kitchenType.length) list.push('Kitchen type');
    if (!c.city || c.city === 'City not set') list.push('City');
    return list;
  }
  function briefCard(c, ctx) {
    const b = c.design.brief;
    const set = function (key) { return function (v) { ctx.update(function () { b[key] = v; }); }; };
    const left = missing(c);
    return Kit.card('DRF · design briefing', left.length ? left.length + ' to fill' : 'Complete', 'violet',
      h('div', { class: 'g2' },
        Kit.field('Design presentation *', Kit.select(D.presentation, b.presentation, set('presentation'))),
        Kit.field('Design theme *', Kit.select(D.theme, b.theme, set('theme'))),
        Kit.field('Ceiling height (mm) *', Kit.input(b.ceilingHeight, set('ceilingHeight'))),
        Kit.field('Kitchen height (mm) *', Kit.select(D.kitchenHeight, b.kitchenHeight, set('kitchenHeight'))),
        Kit.field('Island required *', Kit.select(D.island, b.island, set('island'))),
        Kit.field('Gas arrangement *', Kit.select(D.gas, b.gas, set('gas'))),
        Kit.field('Vastu requirement *', Kit.select(D.vastu, b.vastu, set('vastu'))),
        Kit.field('Design required on *', Kit.input(b.requiredOn, set('requiredOn'), { type: 'date' })),
        Kit.field('City *', Kit.input(c.city === 'City not set' ? '' : c.city, function (v) { ctx.update(function () { c.city = v; }); })),
        Kit.field('Room / area name *', Kit.input(b.room, set('room'))),
        Kit.field('Area (sq ft)', Kit.input(b.sqft, set('sqft'), { placeholder: 'For example 180' }))),
      h('div', { class: 'field' }, h('span', null, 'Kitchen type *'),
        h('div', { class: 'checks' }, D.kitchenType.map(function (k) {
          return h('label', null, h('input', { type: 'checkbox', checked: b.kitchenType.indexOf(k) >= 0, onchange: function () {
            ctx.update(function () { const i = b.kitchenType.indexOf(k); if (i >= 0) b.kitchenType.splice(i, 1); else b.kitchenType.push(k); });
          } }), k);
        }))),
      h('div', { class: 'line' }, h('span', null, 'Drawings and video files', c.docs.drf ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, c.docs.drf)) : null), P.attach(c, 'drf', ctx)),
      h('div', { class: 'line' }, h('span', null, 'House layout', c.docs.layout ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, c.docs.layout)) : null), P.attach(c, 'layout', ctx)),
      Kit.field('Notes', Kit.input(b.notes, set('notes'), { placeholder: 'Any special instructions' })),
      Architects.forClient(c, ctx));
  }

  function nextCard(c, ctx) {
    const s = ui[c.id] = ui[c.id] || { amount: 0, file: '', reason: '', notes: '', mode: '' };
    const step = c.design.step || 'drf';
    const move = function (to) { c.design.step = to; c.design.stepAt = Kit.now(); };
    const body = [];

    if (step === 'drf') {
      body.push(Kit.field('Designer allotted', Kit.select(People.designers, c.design.designer, function (v) { ctx.update(function () { c.design.designer = v; }); })),
        Kit.btn('Send DRF to designer', function () { ctx.update(function () { move('withDesign'); c.design.sentAt = Kit.now(); Kit.news(c, 'DRF sent to Design' + (c.design.designer ? ' · designer ' + c.design.designer : ''), 'blue', 'Sales'); }); }, 'dark', { disabled: missing(c).length > 0 || !c.design.designer }),
        missing(c).length ? h('div', { class: 'msg' }, 'Still to fill in the DRF: ' + missing(c).join(', '))
          : (!c.design.designer ? h('div', { class: 'msg' }, 'Choose the designer to send it to.') : null));
    }
    if (step === 'withDesign') {
      body.push(h('div', null, 'With ' + (c.design.designer ? 'designer ' + c.design.designer : 'Design') + ' · ' + Kit.daysSince(c.design.stepAt) + ' day(s)'));
    }
    if (step === 'toShare') {
      body.push(h('div', null, 'Proposal V' + latest(c).v + ' from Design', latest(c).file ? ' · ' : null, Kit.fileLink(c.id, latest(c).file, 'Open estimate'), latest(c).designFile ? ' · ' : null, Kit.fileLink(c.id, latest(c).designFile, 'Open design')),
        latest(c).note ? h('div', { class: 'sub' }, 'Design note: ' + latest(c).note) : null,
        Kit.btn('Shared with client', function () { ctx.update(function () { latest(c).status = 'With client'; latest(c).sharedAt = Kit.now(); c.design.newProposal = false; move('withClient'); }); }, 'dark'));
    }
    if (step === 'withClient') {
      body.push(h('div', null, 'Proposal V' + latest(c).v + ' with client' + (hasArchitect(c) ? ' and architect' : '') + ' · ' + Kit.daysSince(c.design.stepAt) + ' day(s)'),
        h('div', { class: 'flexrow' },
          Kit.btn(hasArchitect(c) ? 'Changes wanted' : 'Client wants changes', function () { s.mode = s.mode === 'revise' ? '' : 'revise'; s.msg = ''; ctx.update(); }, s.mode === 'revise' ? 'line' : ''),
          Kit.btn(hasArchitect(c) ? 'Client and architect approved' : 'Client approved design and price', function () { s.mode = s.mode === 'approve' ? '' : 'approve'; s.msg = ''; ctx.update(); }, s.mode === 'approve' ? 'line' : '')));
      if (s.mode === 'revise') {
        body.push(h('div', { class: 'soft' },
          h('b', { style: 'font-size: 12px; color: var(--ink2)' }, 'Revision form'),
          hasArchitect(c) ? Kit.field('Changes asked by', Kit.select(['Client', 'Architect', 'Both'], s.by, function (v) { s.by = v; })) : null,
          Kit.field('Reason for revision', Kit.select(D.revisionReason, s.reason, function (v) { s.reason = v; })),
          Kit.field('Notes', Kit.input(s.notes, function (v) { s.notes = v; }, { placeholder: 'What the client wants changed' })),
          h('div', { class: 'line' }, h('span', null, 'Drawings and videos', s.file ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, s.file)) : null), Kit.upload('Upload', s.file, function (file) { Kit.store.sendFile(c.id, file).then(function (name) { s.file = name; ctx.update(); }); })),
          Kit.btn('Send revision to Design', function () {
            if (!s.reason) { s.msg = 'Choose the reason for revision.'; return ctx.update(); }
            ctx.update(function () {
              latest(c).status = 'Revised';
              c.design.revisions.push({ reason: s.reason, by: s.by || 'Client', notes: s.notes, file: s.file, at: Kit.now(), ofVersion: latest(c).v });
              Kit.news(c, 'Revision asked on V' + latest(c).v + ': ' + s.reason, 'yellow', 'Sales');
              move('withDesign'); delete ui[c.id];
            });
          }, 'dark')));
      }
      if (s.mode === 'approve') {
        const ready = c.docs.quotation && c.docs.drawing && (!hasArchitect(c) || c.design.architectOk);
        body.push(h('div', { class: 'soft' },
          h('b', { style: 'font-size: 12px; color: var(--ink2)' }, 'Approval proof'),
          [['Signed quotation', 'quotation'], ['Signed drawing', 'drawing'], ['Screenshot', 'screenshot'], ['Recorded message', 'recording']].map(function (r) {
            return h('div', { class: 'line' }, h('span', null, r[0], c.docs[r[1]] ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, c.docs[r[1]])) : null), P.attach(c, r[1], ctx));
          }),
          hasArchitect(c) ? h('label', { class: 'flexrow' }, h('input', { type: 'checkbox', checked: !!c.design.architectOk, onchange: function () { ctx.update(function () { c.design.architectOk = !c.design.architectOk; }); } }), 'Architect has approved too') : null,
          Kit.btn('Confirm approval · move to Booked', function () {
            ctx.update(function () {
              const p = latest(c);
              p.status = 'Approved'; p.approvedAt = Kit.now();
              c.approvedAt = Kit.now();
              if (!c.order.products.length) {
                const value = Math.round(p.amount / 1.18);
                c.order.products.push({ product: 'Kitchen', value: value });
              }
              c.stage = 'booked'; c.bookedAt = Kit.now(); delete ui[c.id];
              Kit.news(c, 'Client approved the design and signed · booked at ' + Kit.money(p.amount), 'green', 'Sales');
            });
            ctx.open(c);
          }, 'dark', { disabled: !ready }),
          ready ? null : h('div', { class: 'msg' }, 'Still needed: ' + [c.docs.quotation ? '' : 'signed quotation', c.docs.drawing ? '' : 'signed drawing', hasArchitect(c) && !c.design.architectOk ? 'architect approval' : ''].filter(Boolean).join(', '))));
      }
    }
    if (s.msg) body.push(Kit.warn(s));

    const TONE = { 'To share': 'grey', 'With client': 'blue', Revised: 'grey', Approved: 'green' };
    const history = c.design.proposals.slice().reverse().map(function (p) {
      const rev = c.design.revisions.find(function (r) { return r.ofVersion === p.v; });
      return h('div', { class: 'line rule' },
        h('span', null, h('b', null, 'Proposal V' + p.v + ' · ' + Kit.money(p.amount)),
          h('div', { class: 'sub' }, 'From Design ' + Kit.day(p.receivedAt) + (p.sharedAt ? ' · shared ' + Kit.day(p.sharedAt) : '') + (rev ? ' · revised: ' + rev.reason + (rev.by && rev.by !== 'Client' ? ' (' + rev.by.toLowerCase() + ')' : '') : ''), p.file ? ' · ' : null, Kit.fileLink(c.id, p.file, 'Estimate'), p.designFile ? ' · ' : null, Kit.fileLink(c.id, p.designFile, 'Design'))),
        Kit.pill(p.status, TONE[p.status]));
    });
    return Kit.card('Next step', '', 'blue', body, history);
  }

  // Every proposal that came, for looking back once the client has moved on.
  function historyCard(c) {
    const TONE = { 'To share': 'grey', 'With client': 'blue', Revised: 'grey', Approved: 'green' };
    return Kit.card('Proposals', c.design.designer ? 'Designer ' + c.design.designer : '', 'blue', c.design.proposals.length ? c.design.proposals.slice().reverse().map(function (p) {
      const rev = c.design.revisions.find(function (r) { return r.ofVersion === p.v; });
      return h('div', { class: 'line rule' },
        h('span', null, h('b', null, 'Proposal V' + p.v + ' · ' + Kit.money(p.amount)),
          h('div', { class: 'sub' }, 'From Design ' + Kit.day(p.receivedAt) + (rev ? ' · revised: ' + rev.reason : ''), p.file ? ' · ' : null, Kit.fileLink(c.id, p.file, 'Estimate'), p.designFile ? ' · ' : null, Kit.fileLink(c.id, p.designFile, 'Design'))),
        Kit.pill(p.status, TONE[p.status]));
    }) : h('div', null, 'No proposals.'));
  }

  function sheet(c, ctx) {
    const step = c.stage === 'design' ? (STEPS[c.design.step] || STEPS.drf) : ['Design done', 'green'];
    return [
      P.header(c, ctx, Kit.pill(step[0], step[1])),
      h('div', { class: 'cols' }, briefCard(c, ctx), c.stage === 'design' ? nextCard(c, ctx) : historyCard(c), P.contactCard(c, ctx))
    ];
  }

  Sales.register({ id: 'design', title: 'In design', short: 'Design', table: table, sheet: sheet,
    summary: function (list) {
      const value = list.reduce(function (t, c) { const p = latest(c); return t + (p ? Number(p.amount) || 0 : 0); }, 0);
      const fresh = list.filter(function (c) { return c.design.newProposal; }).length;
      const yours = list.filter(function (c) { return (STEPS[c.design.step] || STEPS.drf)[2] === 'You'; }).length;
      return Kit.short(value) + ' · ' + fresh + ' just in · ' + yours + ' your move';
    } });
})();
