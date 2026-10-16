// Design · Pre-design · the timeline window: the dates Sales gave, and Design's own dates written over them when needed.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  // A timeline waiting for Design's yes or no.
  function timelineWindow(c, ctx) {
    const dates = L.dates(c);
    const d = D.drafts['t' + c.id] = D.drafts['t' + c.id] || Object.assign({}, dates || {});
    const approve = function () {
      ctx.update(function () {
        c.approvals.timeline = 'Approved';
        Kit.news(c, 'Design approved the timeline', 'green', 'Design');
        delete D.drafts['t' + c.id];
      });
      ctx.close();
    };
    // Design does not reject a timeline. It writes its own dates over it, and both versions are kept.
    const overwrite = function () {
      ctx.update(function () {
        c.timelineChanges = c.timelineChanges || [];
        c.timelineChanges.push({ at: Kit.now(), by: 'Design', before: Object.assign({}, dates), after: { signoff: d.signoff, pdi: d.pdi, dispatch: d.dispatch, handover: d.handover } });
        c.timeline.type = 'Custom';
        c.timeline.handover = d.handover;
        c.timeline.custom = { signoff: d.signoff, pdi: d.pdi, dispatch: d.dispatch };
        c.approvals.timeline = 'Overwritten';
        Kit.news(c, 'Design changed the timeline · handover now ' + Kit.day(d.handover), 'yellow', 'Design');
        delete D.drafts['t' + c.id];
      });
      ctx.close();
    };
    const changed = dates && ['signoff', 'pdi', 'dispatch', 'handover'].some(function (k) { return d[k] !== dates[k]; });
    const box = function (label, key) { return Kit.field(label, Kit.input(d[key], function (v) { d[key] = v; ctx.update(); }, { type: 'date' })); };
    return {
      title: c.name,
      tag: Kit.pill('Timeline', 'blue'),
      sub: c.pid + ' · ' + c.city + ' · ' + c.product + ' · from ' + People.owner(c),
      body: [topFacts(c), h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)' },
        Kit.card('Timeline from Sales', '', 'violet',
          dates ? h('div', { class: 'facts' },
            fact('Timeline', c.timeline.type), fact('Production days', String(c.timeline.productionDays)),
            fact('Drawing signoff', Kit.day(dates.signoff)), fact('PDI', Kit.day(dates.pdi)),
            fact('Dispatch', Kit.day(dates.dispatch)), fact('Pooja / handover', Kit.day(dates.handover)))
            : h('div', null, 'No handover date has been entered yet.'),
          null),
        dates ? Kit.card('Overwrite with your dates', '', 'teal',
          h('div', { class: 'g2' }, box('Drawing signoff', 'signoff'), box('PDI', 'pdi'), box('Dispatch', 'dispatch'), box('Pooja / handover', 'handover')),
          Kit.btn('Overwrite timeline', overwrite, 'line', { disabled: !changed })) : null)]
    };
  }

  D.timelineWindow = timelineWindow;
})();
