// Management · Analysis. The whole data set, counted eight ways. Read only.
// Bars show size in one colour. Red is kept for things that are wrong.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const S = Signals;
  const view = { range: 'all' };
  const RANGES = [['all', 'All time'], ['month', 'This month'], ['lastMonth', 'Last month'], ['week', 'This week']];

  function sum(list, fn) { return list.reduce(function (t, x) { return t + fn(x); }, 0); }
  function avg(list) { return list.length ? sum(list, function (x) { return x; }) / list.length : null; }
  function days(a, b) { return (new Date(b).getTime() - new Date(a).getTime()) / 86400000; }
  function one(n) { return n == null ? 'No data yet' : (Math.round(n * 10) / 10) + ''; }
  function group(list, keyOf) {
    const map = {};
    list.forEach(function (c) { const k = keyOf(c) || 'Not set'; (map[k] = map[k] || []).push(c); });
    return Object.keys(map).map(function (k) { return { key: k, list: map[k] }; });
  }
  function inRange(c) {
    if (view.range === 'all') return true;
    const now = new Date();
    const got = Kit.ymd(new Date(c.receivedAt));
    let from = Kit.ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to = Kit.ymd(now);
    if (view.range === 'lastMonth') { from = Kit.ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)); to = Kit.ymd(new Date(now.getFullYear(), now.getMonth(), 0)); }
    if (view.range === 'week') { const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); from = Kit.ymd(start); }
    return got >= from && got <= to;
  }

  // One bar per row: name, bar, the number in plain text. Hover a row for the detail.
  function bars(rows, empty) {
    if (!rows.length) return h('div', { class: 'hint' }, empty || 'No data yet.');
    const max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    return h('div', { class: 'ana-bars', role: 'table' }, rows.map(function (r) {
      return h('div', { class: 'ana-row', role: 'row', title: r.tip || (r.label + ': ' + r.text) },
        h('span', { class: 'ana-name', role: 'cell' }, r.label),
        h('span', { class: 'ana-track', role: 'presentation' }, h('i', { class: r.bad ? 'bad' : '', style: 'width: ' + Math.max(r.value ? 3 : 0, Math.round(r.value / max * 100)) + '%' })),
        h('span', { class: 'ana-val num', role: 'cell' }, r.text));
    }));
  }
  function stat(label, value, note, bad) { return h('div', { class: 'ana-stat' }, h('span', null, label), h('b', { class: 'num' + (bad ? ' bad' : '') }, value), h('small', null, note || '')); }
  function card(title, note, body) { return h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, title), h('span', null, note || '')), h('div', { class: 'card-b' }, body)); }
  function worth(c) { return S.value(c); }
  function line(list) { return Kit.short(sum(list, worth)) + ' (' + list.length + ')'; }

  window.Analysis = {
    render: function (mine, rerender) {
      const all = mine.filter(inRange);
      const live = all.filter(function (c) { return S.LIVE.indexOf(c.stage) >= 0; });
      const by = function (stage) { return all.filter(function (c) { return c.stage === stage; }); };
      const booked = by('booked').concat(by('post'));
      const cash = by('token').concat(by('booked'));

      // 1 · where clients are now
      const stages = [['qualified', 'Qualified'], ['design', 'In design'], ['token', 'Token due'], ['booked', 'Booked'], ['post', 'Moved to post-design'], ['lost', 'Disqualified']].map(function (s) {
        const list = by(s[0]);
        return { label: s[1], value: list.length, text: s[0] === 'qualified' || s[0] === 'lost' ? '(' + list.length + ')' : line(list), bad: s[0] === 'lost', tip: s[1] + ': ' + list.length + ' client(s), ' + Kit.money(sum(list, worth)) };
      });
      const reached = all.filter(function (c) { return ['token', 'booked', 'post'].indexOf(c.stage) >= 0; }).length;

      // 2 · speed
      const firstTalk = all.filter(function (c) { return c.spokeAt && new Date(c.spokeAt) >= new Date(c.receivedAt); }).map(function (c) { return days(c.receivedAt, c.spokeAt) * 24; });
      const judged = all.filter(function (c) { return c.spokeAt || L.firstCall(c).late; });
      const kept = judged.filter(function (c) { return c.spokeAt && !c.missed24 && days(c.receivedAt, c.spokeAt) <= 1; }).length;
      const toProposal = all.filter(function (c) { return c.design.sentAt && c.design.proposals[0]; }).map(function (c) { return days(c.design.sentAt, c.design.proposals[0].receivedAt); }).filter(function (d) { return d >= 0; });
      const toYes = all.filter(function (c) { return c.approvedAt && c.design.proposals[0]; }).map(function (c) { return days(c.design.proposals[0].receivedAt, c.approvedAt); }).filter(function (d) { return d >= 0; });
      const toToken = all.filter(function (c) { return c.approvedAt && c.bookedAt; }).map(function (c) { return days(c.approvedAt, c.bookedAt); }).filter(function (d) { return d >= 0; });
      const approved = all.filter(function (c) { return c.approvedAt; });
      const keptPct = judged.length ? Math.round(kept / judged.length * 100) : null;

      // 3 · money
      const due = sum(cash, L.bookingDue), got = sum(cash, L.collected), left = sum(cash, L.bookingLeft);
      const waiting = by('token');
      const age = [['0 to 1 day', 0, 1], ['2 to 3 days', 2, 3], ['4 days or more', 4, 9999]].map(function (b) {
        const list = waiting.filter(function (c) { const d = Kit.daysSince(c.approvedAt); return d >= b[1] && d <= b[2]; });
        return { label: b[0], value: sum(list, L.bookingDue), text: Kit.short(sum(list, L.bookingDue)) + ' (' + list.length + ')', bad: b[1] >= 4 };
      });

      // 4 to 8 · by person, source, PSM, designer, revision reason
      const people = People.list.map(function (p) {
        const list = live.filter(function (c) { return (c.owner || People.list[0].id) === p.id; });
        return { label: p.name, value: sum(list, worth), text: line(list.filter(function (c) { return c.stage !== 'qualified'; })), tip: p.role + ' ' + p.name + ': ' + list.length + ' clients, collected ' + Kit.money(sum(list, L.collected)) };
      }).sort(function (a, b) { return b.value - a.value; });
      const sources = group(all, function (c) { return c.source; }).map(function (g) {
        const won = g.list.filter(function (c) { return ['token', 'booked', 'post'].indexOf(c.stage) >= 0; }).length;
        return { label: g.key, value: g.list.length, text: g.list.length + ' leads · ' + won + ' approved', tip: g.key + ': ' + g.list.length + ' leads, ' + won + ' approved, ' + Kit.money(sum(g.list, worth)) };
      }).sort(function (a, b) { return b.value - a.value; });
      const psms = group(all.filter(function (c) { return c.psm; }), function (c) { return c.psm; }).map(function (g) {
        const won = g.list.filter(function (c) { return ['token', 'booked', 'post'].indexOf(c.stage) >= 0; }).length;
        return { label: g.key, value: g.list.length, text: g.list.length + ' leads · ' + won + ' approved', tip: 'PSM ' + g.key + ': ' + Kit.money(sum(g.list, worth)) + ' in orders' };
      }).sort(function (a, b) { return b.value - a.value; });
      const designers = group(all.filter(function (c) { return c.design.designer; }), function (c) { return c.design.designer; }).map(function (g) {
        const made = sum(g.list, function (c) { return c.design.proposals.length; });
        const revised = sum(g.list, function (c) { return c.design.revisions.length; });
        return { label: g.key, value: made, text: made + ' proposals · ' + revised + ' revised', tip: 'Designer ' + g.key + ': ' + g.list.length + ' client(s)' };
      }).sort(function (a, b) { return b.value - a.value; });
      const why = {};
      all.forEach(function (c) { c.design.revisions.forEach(function (r) { why[r.reason] = (why[r.reason] || 0) + 1; }); });
      const reasons = Object.keys(why).map(function (k) { return { label: k, value: why[k], text: String(why[k]) }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 7);
      const totalRev = sum(all, function (c) { return c.design.revisions.length; });

      return h('div', { class: 'mg' },
        h('div', { class: 'mg-wait' },
          h('span', { class: 'sub' }, all.length + ' clients counted · by the day the lead was received'),
          h('div', { style: 'width: 170px; margin-left: auto' }, Kit.select(RANGES, view.range, function (v) { view.range = v; rerender(); }, { placeholder: false, label: 'Dates' }))),
        h('div', { class: 'ana-grid' },
          card('Where clients are now', reached + ' of ' + all.length + ' reached approval', bars(stages)),
          card('Speed', 'Averages', h('div', { class: 'ana-stats' },
            stat('24-hour rule kept', keptPct == null ? 'No data yet' : keptPct + '%', judged.length ? kept + ' of ' + judged.length + ' leads' : '', keptPct != null && keptPct < 80),
            stat('First conversation', firstTalk.length ? one(avg(firstTalk)) + ' h' : 'No data yet', 'after the lead arrives'),
            stat('Designer turnaround', toProposal.length ? one(avg(toProposal)) + ' days' : 'No data yet', 'DRF sent to first proposal'),
            stat('Client decision', toYes.length ? one(avg(toYes)) + ' days' : 'No data yet', 'first proposal to approval'),
            stat('Token after approval', toToken.length ? one(avg(toToken)) + ' days' : 'No data yet', 'approval to token confirmed'),
            stat('Revisions per approval', approved.length ? one(sum(approved, function (c) { return c.design.revisions.length; }) / approved.length) : 'No data yet', totalRev + ' revisions in all'))),
          card('Money', 'Booking share', [h('div', { class: 'ana-stats' },
            stat('Due', Kit.short(due), cash.length + ' client(s)'), stat('Collected', Kit.short(got), due ? Math.round(got / due * 100) + '% of due' : ''), stat('Still to collect', Kit.short(left), due ? Math.round(left / due * 100) + '% of due' : '', left > 0)),
            h('b', { class: 'ana-sub' }, 'Tokens not yet in, by how long since approval'), bars(age, 'No tokens are waiting.')]),
          card('By sales person', 'Open order value', bars(people)),
          card('By lead source', 'Leads and approvals', bars(sources)),
          card('By PSM', 'Leads sent and approvals', bars(psms, 'No PSM leads in this period.')),
          card('By designer', 'Proposals made', bars(designers, 'No designer has been allotted yet.')),
          card('Why designs get revised', totalRev + ' revisions', bars(reasons, 'No revisions in this period.'))));
    }
  };
})();
