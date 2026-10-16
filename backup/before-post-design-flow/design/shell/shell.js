// Design · the frame of the Design dashboard: the filters on top, the three tabs (My tasks today, Pre-design,
// Post-design), the pages on the left, and which part draws the main area, the right column and the window.
// The parts themselves live in their own folders: my-tasks, pre-design, post-design, client-window, birds-eye, side-panel.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const seen = D.seen, tasks = D.tasks;

  Kit.app({
    id: 'design',
    title: 'Design',
    hears: ['Sales', 'Accounts', 'Measurement'],
    tools: function (ctx) {
      const options = [['', 'Everyone · head ' + People.designHead]].concat(People.designers.map(function (d) { return [d, 'Designer · ' + d]; }));
      const search = h('input', { type: 'search', placeholder: 'Find a client', 'aria-label': 'Find a client', style: 'width: 170px' });
      search.value = S.find;
      search.addEventListener('input', function () { S.find = search.value; ctx.update(); });
      return [
        h('div', { style: 'width: 220px' }, Kit.select(options, S.designer, function (v) { S.designer = v; ctx.update(); }, { placeholder: false, label: 'Viewing' })),
        h('div', { style: 'width: 140px' }, Kit.select([['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']], S.range, function (v) { S.range = v; ctx.update(); }, { placeholder: false, label: 'Dates' })),
        search];
    },
    tabs: function (all) {
      all = seen(all);
      return [
        { id: 'today', label: 'My tasks today', count: tasks(all).length },
        { id: 'pre', label: 'Pre-design', count: all.filter(function (c) { return (c.stage === 'design' || c.stage === 'token' || c.stage === 'booked') && !L.handed(c); }).length },
        { id: 'post', label: 'Post-design', count: all.filter(L.handed).length }
      ];
    },
    pages: function (tab, all) {
      if (tab === 'today') return [];
      all = seen(all);
      const inDesign = all.filter(function (c) { return c.stage === 'design'; });
      const step = function (s) { return inDesign.filter(function (c) { return (c.design.step || 'drf') === s; }); };
      return tab === 'post' ? D.postPages(all) : D.prePages(all, step, inDesign);
    },
    build: function (ctx) {
      const all = seen(ctx.all);
      const inDesign = all.filter(function (c) { return c.stage === 'design'; });
      const step = function (s) { return inDesign.filter(function (c) { return (c.design.step || 'drf') === s; }); };
      const see = function (c) { return function () { ctx.show({ kind: 'client', id: c.id }); }; };
      const main = ctx.tab === 'today' ? D.todayMain(ctx, all) : (ctx.tab === 'post' ? D.postMain(ctx, all, see) : D.preMain(ctx, all, step, inDesign, see));
      const c = ctx.open ? ctx.all.find(function (x) { return x.id === ctx.open.id; }) : null;
      return { main: [D.strip(all, ctx), main], rail: D.rail(ctx, all),
        window: !c ? null : (ctx.open.kind === 'timeline' ? D.timelineWindow(c, ctx) : (ctx.open.kind === 'proposal' ? D.proposalWindow(c, ctx) : D.clientWindow(c, ctx))) };
    }
  });
})();
