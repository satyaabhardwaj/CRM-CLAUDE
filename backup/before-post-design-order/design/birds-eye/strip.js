// Design · the strip of tiles on top of every Design screen: the day at a glance. Each tile opens the list behind it.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, POST = D.POST, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  function strip(all, ctx) {
    const pre = all.filter(function (c) { return (c.stage === 'design' || c.stage === 'booked') && !L.handed(c); });
    const post = all.filter(L.handed);
    const todo = tasks(all);
    const make = all.filter(function (c) { return c.stage === 'design' && c.design.step === 'withDesign'; });
    const late = todo.filter(function (t) { return Kit.daysSince(t.at) >= 3; });
    const collect = post.filter(function (c) { return L.postStage(c) === 'Accounts go-ahead'; });
    const factory = post.filter(function (c) { return L.postStage(c) === 'Factory'; });
    const sum = function (list, fn) { return list.reduce(function (t, c) { return t + fn(c); }, 0); };
    const last = function (c) { const p = c.design.proposals[c.design.proposals.length - 1]; return c.stage === 'design' ? (p ? Number(p.amount) || 0 : 0) : L.totals(c).total; };
    const tile = function (label, big, note, tone, tab, page, pct) {
      return h('button', { type: 'button', class: 'eye' + (ctx.tab === tab && (!page || ctx.page === page) ? ' on' : ''), onclick: function () { ctx.go(tab, page || ''); } },
        h('span', null, label), h('b', { class: 'num' }, big),
        pct == null ? null : h('span', { class: 'meter ' + (tone || 'blue') }, h('i', { style: 'width: ' + Math.max(4, Math.min(100, pct)) + '%' })),
        note ? h('small', { class: tone || '' }, note) : null);
    };
    const share = function (part, whole) { return whole ? Math.round(part / whole * 100) : 0; };
    const onTime = todo.length ? share(todo.length - late.length, todo.length) : 100;
    const signed = post.filter(function (c) { return !!c.drawingSignedAt; }).length;
    const due30 = sum(post, function (c) { return L.productionRow(c) ? L.productionRow(c).amount : 0; });
    const got30 = sum(post, function (c) { return L.productionRow(c) ? L.productionRow(c).paid : 0; });
    return h('section', { class: 'eyes', style: 'grid-template-columns: repeat(5, minmax(0, 1fr))', 'aria-label': 'Design at a glance' },
      tile('My tasks today', '(' + todo.length + ')', onTime + '% inside 3 days', onTime === 100 ? 'green' : (onTime >= 50 ? 'amber' : 'red'), 'today', '', onTime),
      tile('Proposals to make', '(' + make.length + ')', make.filter(isRevision).length + ' revision(s)', 'blue', 'pre', 'make', share(make.length, pre.length)),
      tile('Post-design board', '(' + post.filter(function (c) { return !c.factoryAt; }).length + ')', D.pdiWaiting(all).length + ' waiting for PDI', 'blue', 'post', 'board', share(post.filter(function (c) { return L.flowState(c).design.state === 'done'; }).length, post.length)),
      tile('80% collected', Kit.short(got30) + ' of ' + Kit.short(due30), share(got30, due30) + '% collected', share(got30, due30) >= 50 ? 'green' : (got30 ? 'amber' : 'red'), 'post', 'collections', share(got30, due30)),
      tile('Shot to factory', Kit.short(sum(D.factoryGone(all), function (c) { return L.totals(c).total; })) + ' (' + D.factoryGone(all).length + ')', D.factoryWaiting(all).length + ' waiting for 80% or Accounts', 'green', 'post', 'factory', share(D.factoryGone(all).length, post.length)));
  }

  D.strip = strip;
})();
