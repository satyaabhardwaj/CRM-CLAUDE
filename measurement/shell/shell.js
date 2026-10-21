// Measurement · the frame: the visit-type tabs on top (All four, First Measurement, EPT Marking, EPT Verification, PDI),
// the pages on the left (Overview, Requests, Map and areas, Reports), and which part draws the main area and the window.
// The pages live in their own folders: overview, requests, areas, reports, request-window.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const M = window.MeasurementParts;
  const view = M.view, STAGES = M.STAGES, short = M.short;
  const requests = M.requests, count = M.count, pill = M.pill, row = M.row, bars = M.bars, grouped = M.grouped;

  // The reference uses a permanently compact rail. Its first click navigates,
  // instead of triggering the shared shell's expand-first behavior.
  let currentContext = null;
  document.addEventListener('click', function (event) {
    if (!Kit.showing('measurement') || !currentContext) return;
    const button = event.target.closest && event.target.closest('.nav button');
    if (!button) return;
    const page = { Overview: 'overview', Requests: 'requests', 'Map and areas': 'areas', Reports: 'reports' }[button.getAttribute('aria-label')];
    if (!page) return;
    event.preventDefault(); event.stopImmediatePropagation();
    currentContext.go(currentContext.tab, page);
  }, true);

  Kit.app({
    id: 'measurement',
    title: 'Measurement',
    hears: ['Sales', 'Design'],
    tabs: function (all) {
      const list = requests(all);
      const unavailable = M.live && M.live.enabled && (!M.live.syncedAt || M.live.loading || M.live.error);
      return [{ id: 'all', label: 'All four', count: unavailable ? null : list.filter(function (r) { return r.status !== 'Done'; }).length }].concat(STAGES.map(function (s) {
        return { id: s.toLowerCase().replace(/ /g, '-'), label: s, count: unavailable ? null : list.filter(function (r) { return r.stage === s && r.status !== 'Done'; }).length };
      }));
    },
    pages: function (tab, all) {
      return [
        { id: 'overview', title: 'Overview', short: 'Home', summary: 'Open, scheduled and to schedule' },
        { id: 'requests', title: 'Requests', short: 'Requests', summary: 'Every request, with search by status' },
        { id: 'areas', title: 'Map and areas', short: 'Areas', summary: 'Requests by city' },
        { id: 'reports', title: 'Reports', short: 'Reports', summary: 'Key numbers, people and cities' }
      ];
    },
    build: function (ctx) {
      currentContext = ctx;
      if (M.live && M.live.enabled) {
        M.live.context = ctx;
        if (!M.live.started) M.live.load(false);
        if (M.live.loading || M.live.error || !M.live.syncedAt) return { main: [M.live.banner(), M.live.unavailable()] };
      }
      const stage = STAGES.filter(function (s) { return s.toLowerCase().replace(/ /g, '-') === ctx.tab; })[0] || '';
      const list = M.filtered(requests(ctx.all), ctx.tab);
      const n = count(list);
      const stat = function (label, value, key, bad) {
        return h('button', { type: 'button', class: 'stat' + (view.status === key && ctx.page === 'requests' ? ' on' : ''), onclick: function () { view.status = key; ctx.go(ctx.tab, 'requests'); } },
          h('span', null, label), h('b', { class: 'num' + (bad && value ? ' bad' : '') }, value));
      };
      const stats = h('div', { class: 'statrow' }, stat('Open', n.Open, 'Open'), stat('Scheduled', n.Scheduled, 'Scheduled'), stat('To schedule', n['To Schedule'], 'To Schedule'), stat('Late', n.Late, 'Late', true), stat('Done', n.Done, 'Done'));
      const page = M.pages[ctx.page] || M.pages.overview;
      const content = page(ctx, list, n, stats);
      const filteredHome = view.status || view.filters.search || view.filters.city || view.filters.region || view.filters.owner || view.filters.product || view.filters.zone || view.filters.withProblems || view.filters.stages.length !== 4 || view.filters.dateRange !== 'All time';
      const main = ctx.page === 'overview' && !filteredHome ? content : [M.toolbar(ctx, list), content];
      const r = ctx.open ? requests(ctx.all).filter(function (x) { return x.id === ctx.open.id; })[0] : null;
      return { main: M.live && M.live.enabled ? [M.live.banner(), main] : main, window: r ? (M.live && M.live.enabled ? M.liveDetails(r) : M.details(r, ctx)) : null };
    }
  });
})();
