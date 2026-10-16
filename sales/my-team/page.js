// Dashboard · My team. Only the AVP has it. Everyone who reports to her on one screen, with their numbers,
// and one dropdown per person to move them between ASM and SM. The change is hers alone to make and is saved with the data.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  if (Sales.me.startedAs !== 'AVP') return;
  const below = People.list.filter(function (p) { return p.reportsTo === Sales.me.id; });

  function numbers(all, p) {
    const mine = all.filter(function (c) { return (c.owner || Sales.me.id) === p.id && c.stage !== 'bin' && c.stage !== 'lost'; });
    const booked = mine.filter(function (c) { return c.stage === 'booked'; });
    const post = mine.filter(function (c) { return c.stage === 'post'; });
    const money = booked.concat(post);
    const sum = function (list, fn) { return list.reduce(function (t, c) { return t + fn(c); }, 0); };
    const last = mine.reduce(function (m, c) { return Math.max(m, new Date((c.contacts[0] && c.contacts[0].at) || c.design.stepAt || c.bookedAt || c.receivedAt || 0).getTime()); }, 0);
    // This month against last month: what was booked (by booking date) and what came in (by payment date).
    const now = new Date();
    const key = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    const thisM = key(now), lastM = key(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const month = function (m) {
      const b = money.filter(function (c) { return c.bookedAt && Kit.ymd(new Date(c.bookedAt)).slice(0, 7) === m; });
      let got = 0;
      money.forEach(function (c) { c.payment.receipts.forEach(function (r) { if (r.status === 'Confirmed' && String(r.date || '').slice(0, 7) === m) got += Number(r.amount) || 0; }); });
      return { booked: b.length, value: sum(b, function (c) { return L.totals(c).total; }), got: got };
    };
    const a = month(thisM), z = month(lastM);
    const share = sum(money, L.bookingDue);
    const trend = a.got + a.value > z.got + z.value ? 'up' : (a.got + a.value < z.got + z.value ? 'down' : 'same');
    return { now: a, before: z, trend: trend, rate: share ? Math.round(Math.min(sum(money, L.collected), share) / share * 100) : null,
      clients: mine.length, leads: mine.filter(function (c) { return c.stage === 'qualified'; }).length,
      notCalled: mine.filter(function (c) { return c.stage === 'qualified' && !c.spokeAt; }).length,
      design: mine.filter(function (c) { return c.stage === 'design'; }).length, booked: booked.length, post: post.length,
      value: sum(money, function (c) { return L.totals(c).total; }), got: sum(money, L.collected), left: sum(booked, L.bookingLeft), last: last };
  }

  function table(ctx) {
    const everyone = ctx.everyone;
    const style = 'grid-template-columns: minmax(0, 1.3fr) 110px repeat(5, minmax(0, 0.6fr)) repeat(3, minmax(0, 1fr)) minmax(0, 0.8fr) minmax(0, 1.5fr)';
    const rows = [Sales.me].concat(below).map(function (p) { return { p: p, n: numbers(everyone, p) }; });
    const total = rows.reduce(function (t, r) { return { value: t.value + r.n.value, got: t.got + r.n.got, left: t.left + r.n.left, clients: t.clients + r.n.clients }; }, { value: 0, got: 0, left: 0, clients: 0 });
    // A short reading of the month, for deciding who should be an SM and who an ASM. People only, not the AVP herself.
    const team = rows.filter(function (r) { return r.p.id !== Sales.me.id; });
    const names = function (list) { return list.length ? list.map(function (r) { return r.p.name; }).join(', ') : 'Nobody'; };
    const up = team.filter(function (r) { return r.n.trend === 'up'; }), down = team.filter(function (r) { return r.n.trend === 'down'; });
    const active = team.filter(function (r) { return r.n.now.got + r.n.now.value > 0; }).sort(function (a, b) { return (b.n.now.got - a.n.now.got) || (b.n.now.value - a.n.now.value); });
    const rated = team.filter(function (r) { return r.n.rate != null; }).sort(function (a, b) { return b.n.rate - a.n.rate; });
    const idle = team.filter(function (r) { return !r.n.clients; });
    const card = function (title, big, note, tone) { return h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, title), h('b', { style: 'font-size: 16px' + (tone ? '; color: ' + tone : '') }, big), h('span', null, note)); };
    const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });
    const brief = h('div', { class: 'statrow' },
      card('Best in ' + monthName, active.length ? active[0].p.name : 'Nobody yet', active.length ? 'collected ' + Kit.short(active[0].n.now.got) + ' · booked ' + Kit.short(active[0].n.now.value) + ' this month' : 'No booking or payment recorded this month'),
      card('Up from last month', names(up), up.length ? 'booked and collected more than last month' : 'no one is ahead of last month', up.length ? '#14602F' : ''),
      card('Down from last month', names(down), down.length ? 'booked and collected less than last month' : 'no one has dropped', down.length ? '#B3261E' : ''),
      card('Best at collecting, overall', rated.length ? rated[0].p.name + ' · ' + rated[0].n.rate + '%' : 'No bookings yet', rated.length > 1 ? 'lowest: ' + rated[rated.length - 1].p.name + ' · ' + rated[rated.length - 1].n.rate + '% of booking share collected' : 'share of the booking amount collected'),
      card('No clients yet', names(idle), idle.length ? 'nothing to judge them on yet' : 'everyone has clients'));
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' }, h('div', null, h('h1', null, 'My team'),
        h('p', null, below.length + ' people report to you · ' + total.clients + ' clients · order value ' + Kit.short(total.value) + ' · collected ' + Kit.short(total.got) + ' · ' + Kit.short(total.left) + ' of booking amount still to collect'))),
      brief,
      h('section', { class: 'card list' }, h('div', { class: 'rows', 'data-keep': 'myteam' },
        h('div', { class: 'row head', style: style }, ['Person', 'Role', 'Clients', 'Leads', 'Not called', 'In design', 'Booked', 'Order value', 'Collected', 'Booking amount left', 'Collected %', 'This month against last'].map(function (t) { return h('div', null, t); })),
        rows.map(function (r) {
          const p = r.p, n = r.n;
          const role = p.id === Sales.me.id ? h('span', null, p.role)
            : Kit.select(People.ROLES, p.role, function (v) { ctx.update(function () { const d = Kit.store.data; d.people = d.people || {}; d.people[p.id] = { role: v, changedAt: Kit.now(), by: Sales.me.id }; }); }, { placeholder: false, label: 'Role of ' + p.name });
          return h('div', { class: 'row', style: style + '; cursor: default' },
            h('span', null, h('b', null, p.name), p.role !== p.startedAs ? h('span', { class: 'sub' }, ' · was ' + p.startedAs) : null),
            h('span', null, role),
            h('span', { class: 'num' }, n.clients), h('span', { class: 'num' }, n.leads), h('span', { class: 'num ' + (n.notCalled ? 'bad' : '') }, n.notCalled), h('span', { class: 'num' }, n.design), h('span', { class: 'num' }, n.booked + n.post),
            h('span', { class: 'num' }, n.value ? Kit.short(n.value) : ''), h('span', { class: 'num' }, n.got ? Kit.short(n.got) : ''), h('span', { class: 'num ' + (n.left ? 'bad' : '') }, n.left ? Kit.short(n.left) : ''),
            h('span', { class: 'num' }, n.rate == null ? '' : n.rate + '%'),
            h('span', { style: 'font-size: 12px' },
              h('b', { style: 'color: ' + (n.trend === 'up' ? '#14602F' : (n.trend === 'down' ? '#B3261E' : 'var(--ink3)')) }, n.trend === 'up' ? '▲ Up' : (n.trend === 'down' ? '▼ Down' : (n.clients ? '■ Same' : 'No clients yet'))),
              n.clients ? h('span', { class: 'sub' }, ' · ' + Kit.short(n.now.got + n.now.value) + ' against ' + Kit.short(n.before.got + n.before.value)) : null));
        }))),
      h('div', { class: 'sub' }, 'To see one person\'s own screens, pick them in "Viewing" at the top. Full charts are under the "' + Kit.headName() + '" screen. Up and down compare this month with last month: order value booked plus money received.'));
  }

  Sales.register({ id: 'team', title: 'My team', short: 'Team', page: true, table: table,
    summary: function () { return below.length + ' people · change ASM and SM here'; } });
})();
