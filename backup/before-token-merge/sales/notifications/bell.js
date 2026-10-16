// The notification bell. Two columns:
//   Design: a design came back, a designer promised a date, a designer is late.
//   Approvals: Accounts confirmed, received or rejected money, a booking was approved or rejected,
//              a timeline was approved or changed.
// Calls and follow-ups are not notifications; they live on the dashboards.
// The red number is what you have not seen yet. Opening the bell marks everything as seen.
(function () {
  const h = Kit.h;
  const S = Signals;
  const view = { open: false, fresh: {} };
  const LIVE = ['qualified', 'design', 'token', 'booked', 'post'];
  let redraw = null;
  const ICON = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9"></path><path d="M10 20a2 2 0 0 0 4 0"></path></svg>';

  function seen() { return ((Kit.store.data.seen || {})[Sales.me.id]) || { at: '', alerts: {} }; }
  // Only two kinds of notice belong here: design, and approvals. Calls and follow-ups are not notifications.
  function isApproval(text) { return /accounts|booking|timeline|payment|token/i.test(text); }
  function gather(ctx) {
    const was = seen();
    const design = [], approvals = [];
    ctx.all.forEach(function (c) {
      if (LIVE.indexOf(c.stage) < 0) return;
      (c.news || []).forEach(function (n) {
        (isApproval(n.text) ? approvals : design).push({ id: c.id + n.at, c: c, at: n.at, text: n.text, tone: n.tone, unread: n.at > was.at });
      });
      S.flags(c).forEach(function (f) {
        const about = f[2] === 'Design' ? design : (/accounts/i.test(f[0]) ? approvals : null);
        if (!about) return;
        const id = c.id + '|' + f[0].replace(/[0-9]+/g, '#');
        about.push({ id: id, c: c, at: '', text: f[0], tone: f[1], alert: true, unread: !was.alerts[id] });
      });
    });
    // What is wrong now comes first, then the news, newest on top.
    const order = function (a, b) { return (Number(!!b.alert) - Number(!!a.alert)) || (a.at < b.at ? 1 : -1); };
    design.sort(order); approvals.sort(order);
    return { design: design, approvals: approvals, all: design.concat(approvals), unread: design.concat(approvals).filter(function (x) { return x.unread; }).length };
  }
  function markSeen(g) {
    const data = Kit.store.data;
    data.seen = data.seen || {};
    const keys = {};
    g.all.forEach(function (a) { if (a.alert) keys[a.id] = true; });
    data.seen[Sales.me.id] = { at: Kit.now(), alerts: keys };
  }

  document.addEventListener('click', function (e) {
    if (view.open && !(e.target.closest && e.target.closest('.bell-wrap'))) { view.open = false; if (redraw) redraw(); }
  });

  Sales.addTopTool(function (ctx) {
    redraw = ctx.update;
    const g = gather(ctx);
    const bell = h('button', { type: 'button', class: 'btn round bell', 'aria-label': 'Notifications, ' + g.unread + ' new', 'aria-expanded': view.open ? 'true' : 'false', onclick: function () {
      const opening = !view.open;
      if (opening) {
        view.fresh = {};
        g.all.forEach(function (x) { if (x.unread) view.fresh[x.id] = true; });
      }
      view.open = opening;
      ctx.update(opening && g.unread ? function () { markSeen(g); } : null);
    } });
    bell.innerHTML = ICON;
    if (g.unread && !view.open) bell.append(h('span', { class: 'badge' }, g.unread > 99 ? '99+' : g.unread));

    const go = function (c) { return function () { view.open = false; if (c.stage === 'post') ctx.goTo('tracker', c); else ctx.open(c); }; };
    const row = function (x, right) {
      return h('button', { type: 'button', class: 'note' + (view.fresh[x.id] ? ' new' : ''), onclick: go(x.c) },
        h('span', { class: 'who' }, h('b', null, x.c.name), h('small', null, x.text)), right);
    };
    const when = function (iso) {
      const hrs = Kit.hoursSince(iso);
      const mins = Math.floor(hrs * 60);
      return mins < 2 ? 'just now' : (hrs < 1 ? mins + ' min ago' : Kit.span(hrs) + ' ago');
    };
    const column = function (title, items, empty) {
      return h('div', { class: 'bell-col' },
        h('div', { class: 'note-h' }, h('b', null, title), h('span', null, items.length || '')),
        items.length ? items.slice(0, 30).map(function (x) {
          return row(x, x.alert ? Kit.pill(x.tone === 'red' ? 'Late' : 'Waiting', x.tone === 'red' ? 'red' : 'grey') : h('span', { class: 'sub' }, when(x.at)));
        }) : h('div', { class: 'note-empty' }, empty));
    };
    const panel = !view.open ? null : h('div', { class: 'bell-panel', role: 'dialog', 'aria-label': 'Notifications' },
      column('Design', g.design, 'Nothing from Design.'),
      column('Approvals', g.approvals, 'No approvals yet.'));
    return h('div', { class: 'bell-wrap' }, bell, panel);
  });
})();
