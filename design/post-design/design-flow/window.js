// Design · Post-design · Design window: the design keeps being revised (yellow) until it is finally approved (green).
// Since 19 Oct 2026 Design comes right after the first site measurement; it needs only that to be approved. The client also signs the production drawing,
// which opens only once 80% is in and Accounts has approved it (19 Oct 2026).
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const drafts = {};
  D.designFlowWindow = function (c, ctx) {
    const f = L.flow(c), s = L.flowState(c), g = f.design;
    const d = drafts[c.id] = drafts[c.id] || { back: '' };
    const ready = L.siteMeasured(c);
    const need = function (label, st) { return h('div', { class: 'line rule' }, h('span', null, label), Kit.pill(D.flowColor[st][2], st === 'done' ? 'green' : (st === 'progress' ? 'yellow' : 'red'))); };
    return {
      title: c.name,
      tag: Kit.pill('Design · ' + D.flowColor[s.design.state][2], s.design.state === 'done' ? 'green' : (s.design.state === 'progress' ? 'yellow' : 'red')),
      sub: c.pid + ' · ' + (c.design.designer ? 'Designer ' + c.design.designer : 'No designer'),
      body: [D.topFacts(c), h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)' },
        Kit.card('Before the design can be final', '', 'violet',
          need('1 · First site measurement done', L.siteMeasured(c) ? 'done' : (c.measurement ? 'progress' : 'todo')),
          h('div', { class: 'line rule' }, h('span', null, 'Production drawing signed by client'),
            c.drawingSignedAt ? Kit.pill('Signed ' + Kit.day(c.drawingSignedAt), 'green')
              : (L.gateOpen(c, 'drawing') ? Kit.btn('Client signed it', function () { ctx.update(function () { c.drawingSignedAt = Kit.now(); Kit.news(c, 'Client signed the production drawing', 'green', 'Design'); }); }, 'small line')
                : Kit.pill(L.gate(c, 'drawing').short ? 'Waiting for 80% · ' + Kit.short(L.gate(c, 'drawing').short) + ' to come' : '80% in · waiting for Accounts', 'yellow')))),
        Kit.card('The design', '', 'blue',
          h('div', { class: 'facts' },
            h('div', null, h('span', null, 'Sent to client'), h('b', null, s.design.sent + ' time(s)')),
            h('div', null, h('span', null, 'Returned by client'), h('b', null, s.design.returned + ' time(s)')),
            h('div', null, h('span', null, 'Final approval'), h('b', null, g.approvedAt ? Kit.day(g.approvedAt) : 'Not yet'))),
          Kit.btn('Design sent to client', function () { ctx.update(function () { L.flowLog(g, 'Design sent to client'); }); }, 'line'),
          Kit.field('If the client returned it: what they want changed', Kit.input(d.back, function (v) { d.back = v; })),
          Kit.btn('Client returned the design', function () { ctx.update(function () { L.flowLog(g, 'Client returned the design', d.back); g.approvedAt = ''; Kit.news(c, 'Client returned the design' + (d.back ? ': ' + d.back : ''), 'yellow', 'Design'); d.back = ''; }); }, 'line'),
          g.approvedAt ? Kit.pill('Approved ' + Kit.day(g.approvedAt), 'green')
            : Kit.btn('Design approved (final)', function () {
              if (!ready) { d.msg = 'The first site measurement must be done first.'; return ctx.update(); }
              ctx.update(function () { g.approvedAt = Kit.now(); L.flowLog(g, 'Design approved'); Kit.news(c, 'Final design approved · next: appliances, then EPT', 'green', 'Design'); });
            }, ready ? 'dark' : 'line'),
          Kit.warn(d),
          g.log.length ? g.log.slice().reverse().slice(0, 6).map(function (x) { return h('div', { class: 'hint' }, Kit.dayTime(x.at) + ' · ' + x.what + (x.note ? ' · ' + x.note : '')); }) : null))]
    };
  };
})();
