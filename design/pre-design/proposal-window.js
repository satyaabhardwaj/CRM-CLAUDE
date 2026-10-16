// Design · Pre-design · the proposal window: what Sales sent (DRF, layout, brief) and the form to send proposal V1, V2...
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  // A request for a proposal.
  function proposalWindow(c, ctx) {
    const d = D.drafts[c.id] = D.drafts[c.id] || { amount: 0, estimate: '', design: '', note: '' };
    const b = c.design.brief;
    const rev = isRevision(c) ? lastRevision(c) : null;
    const next = c.design.proposals.length + 1;
    const pick = function (key) { return function (file) { Kit.store.sendFile(c.id, file).then(function (name) { d[key] = name; ctx.update(); }); }; };
    return {
      title: c.name,
      tag: Kit.pill(rev ? 'Revision · V' + next : 'First proposal', rev ? 'yellow' : 'blue'),
      sub: c.pid + ' · ' + c.cid + ' · ' + c.city + ' · ' + c.product + ' · waiting ' + Kit.daysSince(c.design.stepAt) + ' day(s)',
      body: [topFacts(c), h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr)' },
        Kit.card('From Sales', '', 'violet',
          rev ? h('div', { class: 'soft' }, h('b', null, 'Change asked' + (rev.by ? ' by ' + rev.by.toLowerCase() : '') + ': ' + rev.reason), rev.notes ? h('div', null, rev.notes) : null, rev.file ? h('div', null, Kit.fileLink(c.id, rev.file)) : null) : null,
          h('div', { class: 'line rule' }, h('span', null, 'Drawings and video files'), Kit.fileLink(c.id, c.docs.drf) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'line rule' }, h('span', null, 'Layout'), Kit.fileLink(c.id, c.docs.layout) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'facts' },
            fact('Design presentation', b.presentation), fact('Design theme', b.theme),
            fact('Ceiling height (mm)', b.ceilingHeight), fact('Design required on', b.requiredOn ? Kit.day(b.requiredOn) : ''),
            fact('Room / area', b.room), fact('Area (sq ft)', b.sqft), fact('Vastu', b.vastu),
            fact('Kitchen type', b.kitchenType.join(', ')), fact('Kitchen height (mm)', b.kitchenHeight),
            fact('Island', b.island), fact('Gas', b.gas),
            fact('City', c.city), fact('Notes', b.notes),
            fact('Budget', c.budget), fact('Segment', c.segment))),
        Kit.card('Send proposal V' + next, '', 'blue',
          Kit.field('I will send it by', Kit.input(c.design.promisedBy, function (v) { ctx.update(function () { c.design.promisedBy = v; if (v) Kit.news(c, (c.design.designer ? 'Designer ' + c.design.designer : 'The designer') + ' promised the design by ' + Kit.day(v), 'grey', 'Design'); }); }, { type: 'date' })),
          Kit.field('Estimate total (₹), including GST', Kit.input(d.amount, function (v) { d.amount = v; }, { money: true })),
          h('div', { class: 'line rule' }, h('span', null, 'Estimate', d.estimate ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, d.estimate)) : null), Kit.upload('Upload', d.estimate, pick('estimate'))),
          h('div', { class: 'line rule' }, h('span', null, 'Design / floor plan', d.design ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, d.design)) : null), Kit.upload('Upload', d.design, pick('design'))),
          Kit.field('Note for Sales', Kit.input(d.note, function (v) { d.note = v; })),
          Kit.warn(d),
          Kit.btn('Send to ' + People.owner(c), function () {
            if (!d.amount) { d.msg = 'Enter the estimate total.'; return ctx.update(); }
            ctx.update(function () {
              c.design.proposals.push({ v: next, amount: d.amount, file: d.estimate, designFile: d.design, note: d.note, receivedAt: Kit.now(), status: 'To share' });
              c.design.step = 'toShare';
              c.design.stepAt = Kit.now();
              c.design.newProposal = true;
              c.design.promisedBy = '';
              Kit.news(c, 'Proposal V' + next + ' came from Design · ' + Kit.money(d.amount), 'green', 'Design');
              delete D.drafts[c.id];
            });
            ctx.close();
          }, 'dark')))]
    };
  }

  D.proposalWindow = proposalWindow;
})();
