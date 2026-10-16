// The small bird's-eye strip on top of every sales screen. Every number is counted from the saved data.
// Money first, number of orders in brackets, a coloured percentage, and a click shows which clients.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const STAGE = { qualified: 'Qualified', design: 'In design', token: 'Token due', booked: 'Booked' };
  let openTile = '';

  function lastProposal(c) { const p = c.design.proposals[c.design.proposals.length - 1]; return p ? Number(p.amount) || 0 : 0; }
  function sum(list, fn) { return list.reduce(function (total, c) { return total + fn(c); }, 0); }
  function pct(part, whole) { return whole ? Math.round(part / whole * 100) : 0; }

  Sales.setStrip(function (ctx) {
    const live = ctx.all.filter(function (c) { return STAGE[c.stage]; });
    const toCall = live.filter(function (c) { return c.stage === 'qualified' && !c.spokeAt; });
    const inTime = toCall.filter(function (c) { return !L.firstCall(c).late; });
    const design = live.filter(function (c) { return c.stage === 'design'; });
    const token = live.filter(function (c) { return c.stage === 'token'; });
    const booked = live.filter(function (c) { return c.stage === 'booked'; });
    const money = token.concat(booked);
    const owing = money.filter(function (c) { return L.bookingLeft(c) > 0; });
    const paid = money.filter(function (c) { return L.collected(c) > 0; });

    const designValue = sum(design, lastProposal);
    const tokenValue = sum(token, function (c) { return L.totals(c).total; });
    const bookedValue = sum(booked, function (c) { return L.totals(c).total; });
    const pipeline = designValue + tokenValue + bookedValue;
    const orders = design.concat(token, booked);
    const share = sum(money, L.bookingDue);
    const left = sum(money, L.bookingLeft);
    const got = sum(money, L.collected);

    const onTime = toCall.length ? pct(inTime.length, toCall.length) : 100;
    const leftPct = pct(left, share);
    const gotPct = pct(Math.min(got, share), share);

    // Each tile: label, big text, percent, colour, what the percent means, the clients behind it, the amount per client.
    const tiles = [
      ['call', 'Leads to call', '(' + toCall.length + ')', onTime, onTime === 100 ? 'green' : (onTime >= 50 ? 'amber' : 'red'), 'inside 24h', toCall, function (c) { return L.clock(c)[0]; }],
      ['total', 'Total orders', Kit.short(pipeline) + ' (' + orders.length + ')', null, '', '', orders, function (c) { return Kit.money(c.stage === 'design' ? lastProposal(c) : L.totals(c).total); }],
      ['design', 'In design', Kit.short(designValue) + ' (' + design.length + ')', pct(designValue, pipeline), 'blue', 'of total', design, function (c) { return Kit.money(lastProposal(c)); }],
      ['token', 'Token due', Kit.short(tokenValue) + ' (' + token.length + ')', pct(tokenValue, pipeline), 'blue', 'of total', token, function (c) { return Kit.money(L.totals(c).total); }],
      ['booked', 'Booked', Kit.short(bookedValue) + ' (' + booked.length + ')', pct(bookedValue, pipeline), 'blue', 'of total', booked, function (c) { return Kit.money(L.totals(c).total); }],
      ['left', 'To collect', Kit.short(left) + ' (' + owing.length + ')', leftPct, leftPct > 50 ? 'red' : (leftPct > 0 ? 'amber' : 'green'), 'still unpaid', owing, function (c) { return Kit.money(L.bookingLeft(c)); }],
      ['got', 'Collected', Kit.short(got) + ' (' + paid.length + ')', gotPct, gotPct >= 50 ? 'green' : (gotPct > 0 ? 'amber' : 'red'), 'collected', paid, function (c) { return Kit.money(L.collected(c)); }]
    ];
    const now = tiles.find(function (t) { return t[0] === openTile; });

    return h('div', { class: 'eyewrap' },
      h('section', { class: 'eyes', 'aria-label': 'Bird\'s-eye view' }, tiles.map(function (t) {
        return h('button', { type: 'button', class: 'eye' + (t === now ? ' on' : ''), 'aria-expanded': t === now ? 'true' : 'false', onclick: function () { openTile = openTile === t[0] ? '' : t[0]; ctx.update(); } },
          h('span', null, t[1]),
          h('b', { class: 'num' }, t[2]),
          t[3] == null ? null : h('span', { class: 'meter ' + t[4] }, h('i', { style: 'width: ' + Math.max(4, Math.min(100, t[3])) + '%' })),
          t[3] == null ? null : h('small', { class: t[4] }, t[3] + '% ' + t[5]));
      })),
      now ? h('section', { class: 'card eyelist' },
        h('div', { class: 'line', style: 'padding: 10px 16px' }, h('b', null, now[1] + ' · ' + now[6].length + ' client(s)'), Kit.btn('Close', function () { openTile = ''; ctx.update(); }, 'small')),
        now[6].length ? now[6].map(function (c) {
          return h('button', { type: 'button', class: 'row', style: 'grid-template-columns: 1.6fr 1.4fr 1fr 1fr; min-height: 40px', onclick: function () { openTile = ''; ctx.open(c); } },
            h('span', null, h('b', null, c.name), ' ', h('span', { class: 'sub' }, c.pid)),
            h('span', null, c.city + ' · ' + c.product),
            h('span', null, STAGE[c.stage]),
            h('span', { class: 'num', style: 'text-align: right; font-weight: 600' }, now[7](c)));
        }) : h('div', { class: 'empty' }, 'Nobody here right now.')) : null);
  });
})();
