// Weekly sales report: one button at the top of Sales. It makes a PDF of the last 7 days
// for whoever is being viewed (yourself, or the person chosen in the "Me" box).
// What counts as "this week": the lead came in, a call was saved, the client was accepted into design,
// a proposal came, the client booked, Accounts confirmed money, or the lead was lost, in the last 7 days.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  function make(ctx) {
    const to = new Date(), from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
    const inWeek = function (iso) { if (!iso) return false; const t = new Date(iso); return t >= from && t <= to; };
    const all = ctx.all.filter(function (c) { return c.stage !== 'bin'; });
    const sum = function (list, f) { return list.reduce(function (t, x) { return t + (Number(f(x)) || 0); }, 0); };
    const names = function (list, extra) { return list.length ? list.map(function (c) { return c.name + (extra ? ' (' + extra(c) + ')' : ''); }).join(', ') : 'None'; };
    const value = function (c) { return L.totals(c).total; };

    const fresh = all.filter(function (c) { return inWeek(c.receivedAt); });
    const calls = [];
    all.forEach(function (c) { (c.contacts || []).forEach(function (e) { if (inWeek(e.at)) calls.push({ c: c, e: e }); }); });
    const spoke = calls.filter(function (x) { return /spoke/i.test(x.e.outcome || ''); });
    const accepted = all.filter(function (c) { return inWeek(c.acceptedAt); });
    const proposals = [];
    all.forEach(function (c) { (c.design.proposals || []).forEach(function (p) { if (inWeek(p.receivedAt)) proposals.push({ c: c, p: p }); }); });
    const booked = all.filter(function (c) { return inWeek(c.bookedAt); });
    const lost = all.filter(function (c) { return c.stage === 'lost' && inWeek(c.lostAt); });
    const money = [];
    all.forEach(function (c) { c.payment.receipts.forEach(function (r) { if (r.status === 'Confirmed' && inWeek(r.decidedAt || r.date)) money.push({ c: c, r: r }); }); });
    const owing = all.filter(function (c) { return c.stage === 'booked' && L.bookingLeft(c) > 0; });
    const uncalled = all.filter(function (c) { return c.stage === 'qualified' && !c.spokeAt; });
    const stage = function (id) { return all.filter(function (c) { return c.stage === id; }); };
    const who = Sales.me.name;
    const span = Kit.day(from.toISOString()) + ' to ' + Kit.day(to.toISOString());

    Kit.pdf('Weekly-sales-report-' + who.replace(/[^A-Za-z0-9]+/g, '-') + '-' + to.toISOString().slice(0, 10) + '.pdf',
      'Weekly sales report', who + ' · ' + span + ' · amounts in lakhs', [
        { heading: 'This week in short', rows: [
          ['New leads', String(fresh.length)],
          ['Calls and contacts saved', calls.length + ' · spoke to client ' + spoke.length],
          ['Accepted into design', String(accepted.length)],
          ['Proposals received', String(proposals.length)],
          ['Booked', booked.length + ' · ' + Kit.short(sum(booked, value))],
          ['Money confirmed by Accounts', Kit.short(sum(money, function (x) { return x.r.amount; })) + ' · ' + money.length + ' payment(s)'],
          ['Leads lost', String(lost.length)]] },
        { heading: 'Where everything stands today', rows: [
          ['Qualified leads', stage('qualified').length + ' · not called yet ' + uncalled.length],
          ['In design', String(stage('design').length)],
          ['Booked, collecting', stage('booked').length + ' · order value ' + Kit.short(sum(stage('booked'), value))],
          ['Post-design', stage('post').length + ' · order value ' + Kit.short(sum(stage('post'), value))],
          ['Booking amount still to collect', Kit.short(sum(owing, L.bookingLeft)) + ' from ' + owing.length + ' client(s)']] },
        { heading: 'New leads this week', rows: fresh.map(function (c) { return [c.name, (c.city || '') + ' · ' + (c.source || 'Source not set') + ' · ' + (c.spokeAt ? 'spoken to' : 'not called yet')]; }) },
        { heading: 'Booked this week', rows: booked.map(function (c) { return [c.name, Kit.short(value(c)) + ' · ' + c.payment.plan + ' plan · collected ' + Kit.short(L.collected(c))]; }) },
        { heading: 'Money confirmed this week', rows: money.map(function (x) { return [x.c.name, Kit.short(x.r.amount) + ' · ' + Kit.day(x.r.decidedAt || x.r.date) + (x.r.mode ? ' · ' + x.r.mode : '')]; }) },
        { heading: 'Proposals received this week', rows: proposals.map(function (x) { return [x.c.name, 'V' + x.p.v + ' · ' + Kit.short(x.p.amount)]; }) },
        { heading: 'Calls this week', rows: calls.map(function (x) { return [x.c.name, Kit.dayTime(x.e.at) + ' · ' + Kit.outcome(x.e.outcome) + (x.e.note ? ' · ' + x.e.note : '')]; }) },
        { heading: 'Lost this week', rows: lost.map(function (c) { return [c.name, c.lostReason || 'No reason given']; }) },
        { heading: 'Still to collect', rows: owing.map(function (c) { return [c.name, Kit.short(L.bookingLeft(c)) + ' left of ' + Kit.short(L.bookingDue(c)) + (c.payment.expectedBy ? ' · expected ' + Kit.day(c.payment.expectedBy) : ' · no date set')]; }) },
        { heading: 'Not called yet', rows: uncalled.map(function (c) { return [c.name, 'received ' + Kit.day(c.receivedAt) + ' · ' + (c.city || '')]; }) }
      ]);
  }
  // A small round button, like the bell, so the top bar stays on one line.
  const ICON = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"></path><path d="M7 11l5 5 5-5"></path><path d="M5 20h14"></path></svg>';
  Sales.addTopTool(function (ctx) {
    const b = h('button', { type: 'button', class: 'btn round bell', title: 'Download the weekly sales report', 'aria-label': 'Download the weekly sales report', onclick: function () { make(ctx); } });
    b.innerHTML = ICON;
    return b;
  });
})();
