// Design · the client window: everything about one client on one screen (both pre- and post-design),
// including the post-design steps: site measurement, design, appliances, EPT, PDI, Accounts go-ahead at 80%, factory.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  // Everything about one client on one screen, for the designer who now owns them.
  function clientWindow(c, ctx) {
    const b = c.design.brief, d = L.dates(c), t = L.totals(c);
    const last = L.lastSpoke(c);
    const p = c.design.proposals[c.design.proposals.length - 1];
    const post = L.handed(c);
    return {
      title: c.name,
      tag: Kit.pill(post ? L.postStage(c) : (STEP[c.design.step] || c.stage), 'blue'),
      sub: c.pid + ' · ' + c.cid + ' · ' + c.city + ' · ' + c.product + (c.phone ? ' · ' + c.phone : ''),
      body: [(function () {
        const fs = L.flowState(c), fl = L.flow(c);
        const steps = [['Proposal', c.design.proposals.length > 0 || !!c.approvedAt], ['Client approved', !!c.approvedAt], ['Booking share in', post], ['EPT signed', fs.ept.state === 'done'], ['Appliances signed', fs.appliances.state === 'done'], ['Design approved', fs.design.state === 'done'], ['PDI approved', !!fl.pdi.approvedAt], ['Factory', !!c.factoryAt]];
        const at = steps.findIndex(function (x) { return !x[1]; });
        return h('div', { class: 'steps', style: 'flex: none' }, steps.map(function (x, i) { return h('span', { class: x[1] ? 'done' : (i === at ? 'now' : '') }, x[0]); }));
      })(),
      topFacts(c),
      h('div', { class: 'cols' },
        Kit.card('Who has this client', '', 'violet', h('div', { class: 'facts' },
          fact('Point of contact', post ? (c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted') : People.owner(c)),
          fact('Sales person', People.owner(c)), fact('Designer', c.design.designer),
          fact('Last spoke to client', last ? Kit.day(last) : ''), fact('Next follow-up', c.nextFollowUp ? Kit.when(c.nextFollowUp) : ''),
          fact('Calls logged', String(c.contacts.length || 0))),
          c.contacts.slice(0, 3).map(function (e) { return h('div', { class: 'hint' }, Kit.dayTime(e.at) + ' · ' + e.type + ' · ' + Kit.outcome(e.outcome) + (e.note ? ' · ' + e.note : '')); })),
        Kit.card('Design', '', 'blue', h('div', { class: 'facts' },
          fact('Proposals', String(c.design.proposals.length || 0)), fact('Revisions', String(c.design.revisions.length || 0)),
          fact('Latest proposal', p ? 'V' + p.v + ' · ' + Kit.money(p.amount) + ' · ' + p.status : ''), fact('Client approved', c.approvedAt ? Kit.day(c.approvedAt) : ''),
          fact('Design theme', b.theme), fact('Kitchen type', b.kitchenType.join(', ')),
          fact('Room / area', b.room), fact('Notes', b.notes)),
          [['Signed quotation', 'quotation'], ['Signed drawing', 'drawing'], ['Drawings and video files', 'drf'], ['Layout', 'layout']].map(function (r) {
            return h('div', { class: 'line rule' }, h('span', null, r[0]), Kit.fileLink(c.id, c.docs[r[1]]) || h('span', { class: 'sub' }, 'Not uploaded'));
          })),
        Kit.card('Dates and money', '', 'green',
          !post ? null : (function () {
            const row = L.productionRow(c);
            const fs = L.flowState(c), fl = L.flow(c);
            const open = function (kind) { return function () { ctx.show({ kind: kind, id: c.id }); }; };
            return h('div', { class: 'soft' },
              h('b', { style: 'font-size: 12px; color: var(--ink2)' }, 'Post-design steps'),
              h('div', { class: 'g2' }, D.flowButton(L.measureState(c).state, ['1 · Site measurement'].concat(D.measureSmall(L.measureState(c))), open('measure'), 'Site measurement', L.measureState(c).step), D.flowButton(fs.design.state, '2 · Design', open('designflow'), 'Design'),
                D.flowButton(fs.appliances.state, '3 · Appliances', open('appliances'), 'Appliances'), D.flowButton(fs.ept.state, '4 · EPT', open('ept'), 'EPT')),
              h('div', { class: 'line' }, h('span', null, '5 · PDI'), fl.pdi.approvedAt ? Kit.pill('Approved ' + short(fl.pdi.approvedAt), 'green') : Kit.btn(L.readyForPdi(c) ? 'Open PDI' : 'After design, appliances and EPT', open('pdi'), 'small line')),
              h('div', { class: 'line' }, h('span', null, '6 · 80% in · Accounts go-ahead' + (row ? ' · ' + Kit.money(row.amount) : '')),
                !row ? Kit.pill('Not in this plan', 'grey') : (row.due === 0 ? Kit.pill('Received', 'green') : Kit.pill(Kit.money(row.due) + ' to collect', 'red'))),
              h('div', { class: 'line' }, h('span', null, '7 · Shoot to factory'),
                c.factoryAt ? Kit.pill('In factory since ' + short(c.factoryAt), 'green') : Kit.pill('After 5 and 6', 'grey')),
              c.factoryAt ? h('div', { class: 'sub' }, D.mailLine(c)) : null,
              h('div', { class: 'sub' }, 'Once the PDI is approved and 80% is in, Accounts gives the go-ahead; then the order goes to the factory and the factory is emailed.'));
          })(),
          h('div', { class: 'facts' },
          fact('Drawing signoff', d ? Kit.day(d.signoff) : ''), fact('PDI', d ? Kit.day(d.pdi) : ''),
          fact('Dispatch', d ? Kit.day(d.dispatch) : ''), fact('Handover', d ? Kit.day(d.handover) : ''),
          fact('Order value', t.total ? Kit.money(t.total) : ''), fact('Paid so far', t.total ? Kit.money(L.collected(c)) + ' · ' + Math.round(L.collected(c) / t.total * 100) + '%' : '')),
          L.ledger(c).map(function (s) {
            return h('div', { class: 'line rule' }, h('span', null, h('b', null, s.name), h('span', { class: 'sub' }, ' · ' + s.percent + '% · ' + Kit.money(s.amount))),
              Kit.pill(s.due === 0 && s.amount ? 'Paid' : (s.paid ? Kit.money(s.due) + ' left' : 'Not paid'), s.due === 0 && s.amount ? 'green' : 'grey'));
          })))]
    };
  }

  D.clientWindow = clientWindow;
})();
