// Design · the client window: everything about one client on one screen (both pre- and post-design),
// including the post-design steps: final drawing signoff, collect 30%, factory.
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
        const steps = [['Proposal', c.design.proposals.length > 0 || !!c.approvedAt], ['Client approved', !!c.approvedAt], ['Booking share in', post], ['Drawing signed off', !!c.drawingSignedAt], ['30% in', post && !!c.drawingSignedAt && !(L.productionRow(c) && L.productionRow(c).due > 0)], ['Factory', !!c.factoryAt]];
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
            return h('div', { class: 'soft' },
              h('b', { style: 'font-size: 12px; color: var(--ink2)' }, 'Post-design steps'),
              h('div', { class: 'line' }, h('span', null, '1 · Final production drawing'),
                c.drawingSignedAt ? Kit.pill('Signed off ' + short(c.drawingSignedAt), 'green')
                  : Kit.btn('Final drawing signed off', function () { ctx.update(function () { c.drawingSignedAt = Kit.now(); Kit.news(c, 'Final production drawing signed off', 'green', 'Design'); L.toFactory(c); }); }, 'small dark')),
              h('div', { class: 'line' }, h('span', null, '2 · Collect 30%' + (row ? ' · ' + Kit.money(row.amount) : '')),
                !row ? Kit.pill('Not in this plan', 'grey') : (row.due === 0 ? Kit.pill('Received', 'green') : Kit.pill(Kit.money(row.due) + ' to collect', 'red'))),
              h('div', { class: 'line' }, h('span', null, '3 · Factory'),
                c.factoryAt ? Kit.pill('In factory since ' + short(c.factoryAt), 'green') : Kit.pill('After 1 and 2', 'grey')),
              c.factoryMail ? h('div', { class: 'sub' }, c.factoryMail.state === 'sent' ? 'Factory emailed: ' + (c.factoryMail.to || []).join(', ') + (c.factoryMail.test ? ' (test mode)' : '') : (c.factoryMail.state === 'sending' ? 'Emailing the factory…' : 'Factory email not sent. ' + (c.factoryMail.why || ''))) : null,
              h('div', { class: 'sub' }, 'Accounts records the 30% when it arrives. The order moves to the Factory by itself once both are done.'));
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
