// The right side of every sales screen: Just in, Call again, Money to collect, Approvals pending.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const live = ['qualified', 'design', 'token', 'booked'];

  // A box shows its first three items. "See all" opens the rest.
  const wide = {};
  let redraw = null;
  function box(title, meta, tone, items, empty) {
    const shown = wide[title] ? items : items.slice(0, 3);
    return h('section', { class: 'card' },
      h('div', { class: 'card-h t-' + tone }, h('h2', { style: 'font-size: 15px' }, title), h('span', { style: 'font-weight: 600' }, items.length || '')),
      items.length ? shown : h('div', { class: 'item hint', style: 'cursor: default' }, empty),
      items.length > 3 ? h('button', { type: 'button', class: 'item more', onclick: function () { wide[title] = !wide[title]; redraw(); } }, wide[title] ? 'Show less' : 'See all ' + items.length) : null);
  }
  function item(ctx, c, pill, text) {
    return h('button', { type: 'button', class: 'item', onclick: function () { ctx.open(c); } },
      h('div', { class: 'line' }, h('b', null, c.name), pill),
      h('div', { class: 'sub', style: 'margin-top: 2px' }, text));
  }

  window.SalesPanel = {
    // Each screen gets its own boxes. A stage screen only talks about that stage's clients.
    render: function (ctx) {
      redraw = ctx.update;
      const stage = live.indexOf(ctx.dash) >= 0 ? ctx.dash : '';
      const mine = ctx.all.filter(function (c) { return live.indexOf(c.stage) >= 0 && (!stage || c.stage === stage); });
      const days = function (iso) { return Kit.daysSince(iso) + ' day(s)'; };
      const latest = function (c) { return c.design.proposals[c.design.proposals.length - 1]; };

      const calls = mine.filter(function (c) { return c.retry; }).map(function (c) {
        const due = (new Date(c.retry.dueAt).getTime() - Date.now()) / 3600000;
        return item(ctx, c, Kit.pill('Try ' + (c.retry.tries + 1) + ' · ' + Kit.span(due) + (due >= 0 ? ' left' : ' late'), due < 0 ? 'red' : 'yellow'), 'No answer ' + c.retry.tries + ' time(s)' + (c.contacts[0] ? ' · last try ' + Kit.dayTime(c.contacts[0].at) : ''));
      });

      const money = mine.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && L.bookingLeft(c) > 0; }).map(function (c) {
        const by = L.payDue(c);
        const late = by ? Math.round((new Date(Kit.today()) - new Date(by)) / 86400000) : 0;
        const text = !by ? 'No date set' : (late > 0 ? late + ' day(s) overdue' : (late === 0 ? 'Due today' : 'Due ' + Kit.day(by).replace(/ \d{4}$/, '')));
        return item(ctx, c, Kit.pill(text, 'red'), (c.stage === 'token' ? 'Token ' + Kit.money(L.atStake(c)) : Kit.money(L.bookingLeft(c)) + ' left') + ' · collected ' + Kit.money(L.collected(c)));
      });

      const approvals = [];
      mine.forEach(function (c) {
        if (c.stage === 'design' && c.design.step === 'withDesign') approvals.push(item(ctx, c, Kit.pill('Designer · ' + days(c.design.stepAt), 'blue'), c.design.revisions.length ? 'Revision · ' + c.design.revisions[c.design.revisions.length - 1].reason : 'First proposal'));
        if (c.stage === 'design' && c.design.step === 'withClient') approvals.push(item(ctx, c, Kit.pill('Client · ' + days(c.design.stepAt), 'blue'), 'Proposal V' + c.design.proposals.length + ' shared · call to close'));
        if (c.payment.receipts.some(function (r) { return r.status === 'Requested'; })) approvals.push(item(ctx, c, Kit.pill('Accounts', 'blue'), 'Payment receipt to confirm'));
        else if (!L.tokenIn(c) && c.payment.receipts.some(function (r) { return r.status === 'Rejected'; })) approvals.push(item(ctx, c, Kit.pill('Accounts rejected', 'red'), 'Payment needs fixing'));
        [['plan', L.PLANS[c.payment.plan].approver, 'Payment plan'], ['timeline', 'Design', 'Timeline'], ['booking', 'Accounts', 'Booking']].forEach(function (a) {
          if (c.approvals[a[0]] === 'Pending') approvals.push(item(ctx, c, Kit.pill(a[1], 'blue'), a[2] + ' approval pending'));
          if (c.approvals[a[0]] === 'Rejected') approvals.push(item(ctx, c, Kit.pill(a[1] + ' rejected', 'red'), a[2] + ' needs fixing'));
        });
      });

      // What other teams did in the last two days.
      const fresh = [];
      mine.forEach(function (c) { (c.news || []).forEach(function (n) { if (Kit.hoursSince(n.at) <= 48) fresh.push({ c: c, n: n }); }); });
      fresh.sort(function (a, b) { return new Date(b.n.at) - new Date(a.n.at); });
      const justIn = fresh.map(function (x) { return item(ctx, x.c, Kit.pill(Kit.span(Kit.hoursSince(x.n.at)) + ' ago', x.n.tone), x.n.text); });

      const B = {
        justIn: function () { return box('Just in', '', 'blue', justIn, 'Nothing new from Design or Accounts.'); },
        calls: function () { return box('Call again', '', 'amber', calls, 'Nobody to call again.'); },
        money: function () { return box('Money to collect', '', 'red', money, 'Nothing to collect right now.'); },
        approvals: function () { return box('Approvals pending', '', 'teal', approvals, 'Nothing is waiting on anyone.'); }
      };

      if (stage === 'qualified') {
        const open = mine.filter(function (c) { return !c.spokeAt && !c.retry; }).sort(function (a, b) { return new Date(a.receivedAt) - new Date(b.receivedAt); });
        const first = open.map(function (c) { const k = L.clock(c); return item(ctx, c, Kit.pill(k[0], k[1]), (c.psm ? 'PSM ' + c.psm : 'Own lead') + ' · ' + c.city); });
        const high = mine.filter(function (c) { return c.priority === 'High'; }).map(function (c) { const k = L.clock(c); return item(ctx, c, Kit.pill(k[0], k[1]), (c.budget || 'Budget not shared') + ' · ' + c.product); });
        const spoke = mine.filter(function (c) { return c.spokeAt; }).map(function (c) { return item(ctx, c, Kit.pill('Spoke ' + Kit.day(c.spokeAt).replace(/ \d{4}$/, ''), 'green'), 'Accept and start the DRF'); });
        return [box('First call due', '', 'blue', first, 'Every lead has been called.'), B.calls(), box('High priority', '', 'red', high, 'No high priority leads.'), box('Spoken, ready for DRF', '', 'green', spoke, 'Nobody is waiting to be accepted.')];
      }
      if (stage === 'design') {
        const by = function (step) { return mine.filter(function (c) { return (c.design.step || 'drf') === step; }).sort(function (a, b) { return new Date(a.design.stepAt || 0) - new Date(b.design.stepAt || 0); }); };
        const inbox = by('toShare').map(function (c) { const p = latest(c); return item(ctx, c, Kit.pill('V' + p.v + ' · ' + Kit.short(p.amount), 'green'), 'Check it and send to the client · came ' + Kit.span(Kit.hoursSince(p.receivedAt)) + ' ago'); });
        const withDesigner = by('withDesign').map(function (c) { return item(ctx, c, Kit.pill(days(c.design.stepAt), Kit.daysSince(c.design.stepAt) >= 3 ? 'red' : 'grey'), (c.design.designer ? 'Designer ' + c.design.designer : 'No designer allotted') + (c.design.promisedBy ? ' · promised ' + Kit.day(c.design.promisedBy).replace(/ \d{4}$/, '') : (c.design.revisions.length ? ' · revision ' + c.design.revisions.length : ' · first proposal'))); });
        const withClient = by('withClient').map(function (c) { const p = latest(c); return item(ctx, c, Kit.pill(days(c.design.stepAt), Kit.daysSince(c.design.stepAt) >= 3 ? 'red' : 'grey'), 'V' + p.v + ' · ' + Kit.money(p.amount) + ' · call to close'); });
        const toSend = by('drf').map(function (c) { return item(ctx, c, Kit.pill(days(c.design.stepAt), 'grey'), 'Fill the DRF and allot a designer'); });
        return [box('Just in from design', '', 'green', inbox, 'No new proposal.'), box('Pending with designer', '', 'blue', withDesigner, 'Nothing is with a designer.'), box('Waiting for client', '', 'blue', withClient, 'No proposal is with a client.'), box('Send DRF', '', 'grey', toSend, 'No DRF to send.'), B.calls()];
      }
      if (stage === 'token') {
        const sent = [], refused = [];
        mine.forEach(function (c) {
          const asked = c.payment.receipts.filter(function (r) { return r.status === 'Requested'; })[0];
          const no = c.payment.receipts.filter(function (r) { return r.status === 'Rejected'; });
          if (asked) sent.push(item(ctx, c, Kit.pill(days(asked.requestedAt), 'grey'), Kit.money(asked.amount) + ' · ' + (asked.mode || 'mode not set') + ' · sent ' + Kit.day(asked.requestedAt).replace(/ \d{4}$/, '')));
          else if (no.length && !L.tokenIn(c)) refused.push(item(ctx, c, Kit.pill(no.length + ' time(s)', 'red'), Kit.money(no[no.length - 1].amount) + ' · ' + (no[no.length - 1].reason || 'Rejected')));
        });
        return [B.money(), box('Rejected by Accounts', '', 'red', refused, 'Nothing has been rejected.'), box('With Accounts', '', 'blue', sent, 'Nothing is waiting with Accounts.'), B.calls()];
      }
      if (stage === 'booked') return [B.money(), B.approvals(), B.justIn(), B.calls()];
      return [B.justIn(), B.calls(), B.money(), B.approvals()];
    }
  };
})();
