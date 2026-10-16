// Design · My tasks today: every task on the designer's plate, oldest first, in two lists like Sales:
// before the booking share (pre-design) and after it (post-design).
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, POST = D.POST, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  D.todayMain = function (ctx, all) {
        // Everything a designer has on their plate right now, oldest first: who, what, since when, how big, and which side of the 50%.
        const list = tasks(all).filter(function (t) { return !S.designer || t.c.design.designer === S.designer; });
        // Two lists side by side, like Sales: what is to be done before the booking share, and what after.
        const item = function (t) {
          const c = t.c, days = Kit.daysSince(t.at), p = c.design.proposals[c.design.proposals.length - 1], row = L.productionRow(c);
          const area = c.design.brief.sqft ? Kit.commas(Kit.num(c.design.brief.sqft)) + ' sq ft' : '';
          const amount = t.pre ? (p ? Kit.short(p.amount) : (c.budget ? 'budget ' + c.budget : '')) : Kit.short(L.totals(c).total) + (row && row.due ? ' · ' + Kit.short(row.due) + ' to collect' : '');
          return { name: c.name, priority: c.priority, sub: [t.pre ? t.what : t.what.replace(/ · .*$/, ''), c.design.designer || 'No designer', area, amount].filter(Boolean).join(' · '),
            pill: Kit.pill(days === 0 ? 'Today' : days + (days === 1 ? ' day' : ' days'), days >= 3 ? 'red' : (days >= 1 ? 'yellow' : 'green')), mark: days >= 3 ? 'bad' : (days === 0 ? 'new' : ''), pick: function () { ctx.show({ kind: t.kind, id: c.id }); } };
        };
        return h('div', { class: 'twolists' },
          Kit.list('Pre-design tasks',
            h('div', { style: 'width: 170px' }, Kit.select([['first', 'First proposal'], ['revision', 'Revision'], ['late', 'Waiting 3 days or more']], S.kind, function (v) { S.kind = v; ctx.update(); }, { placeholder: 'All tasks', label: 'Type of task' })),
            list.filter(function (t) { return t.pre && (!S.kind || (S.kind === 'late' ? Kit.daysSince(t.at) >= 3 : (S.kind === 'revision') === isRevision(t.c))); }).map(item), 'No proposals or revisions to make.'),
          Kit.list('Post-design tasks',
            h('div', { style: 'width: 170px' }, Kit.select([['drawing', 'Drawing to sign off'], ['collect', 'Collect 30%'], ['late', 'Waiting 3 days or more']], S.postKind, function (v) { S.postKind = v; ctx.update(); }, { placeholder: 'All tasks', label: 'Type of task' })),
            list.filter(function (t) { return !t.pre && (!S.postKind || (S.postKind === 'late' ? Kit.daysSince(t.at) >= 3 : (S.postKind === 'collect') === (L.postStage(t.c) === 'Collect 30%'))); }).map(item), 'No drawings to sign off and no 30% to collect.'));
  };
})();
