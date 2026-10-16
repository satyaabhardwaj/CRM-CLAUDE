// Sent for approvals: everything the sales person has sent to someone else for a yes, and what came back.
// Accounts (token, payments, booking), Design (timeline), the plan approver, and the client (proposal).
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const TONE = { Pending: 'yellow', Approved: 'green', Rejected: 'red', Overwritten: 'grey' };
  const view = { status: 'Pending', who: '' };

  // Every request on one client, as rows.
  function requests(c) {
    const out = [];
    const add = function (what, who, amount, sentAt, status, note) { out.push({ c: c, what: what, who: who, amount: amount, sentAt: sentAt, status: status, note: note || '' }); };
    c.payment.receipts.forEach(function (r, i) {
      const status = r.status === 'Requested' ? 'Pending' : (r.status === 'Confirmed' ? 'Approved' : 'Rejected');
      add((i === 0 ? 'Token' : 'Payment') + ' · ' + (r.kind === 'md' ? 'management discount' : 'in bank'), 'Accounts', Number(r.amount) || 0, r.requestedAt || r.date, status, r.reason || '');
    });
    if (['token', 'booked', 'post'].indexOf(c.stage) >= 0) {
      const a = c.approvals, why = c.approvalNotes || {};
      if (a.booking !== 'Not sent') add('Booking', 'Accounts', L.totals(c).total, c.submittedAt, a.booking, why.booking ? why.booking.reason : '');
      if (a.timeline !== 'Not sent') add('Timeline', 'Design', 0, c.submittedAt, a.timeline, a.timeline === 'Overwritten' ? 'Dates changed by Design' : '');
      if (a.plan !== 'Not sent') add('Payment plan · ' + c.payment.plan, L.PLANS[c.payment.plan].approver, 0, c.submittedAt, a.plan);
    }
    if (c.stage === 'design' && c.design.step === 'withClient') {
      const p = c.design.proposals[c.design.proposals.length - 1];
      add('Proposal V' + p.v, hasArchitect(c) ? 'Client and architect' : 'Client', Number(p.amount) || 0, p.sharedAt || c.design.stepAt, 'Pending');
    }
    return out;
  }
  function hasArchitect(c) { return c.architectInvolved != null ? c.architectInvolved : c.source === 'Architect reference'; }
  function all(clients) { return clients.filter(function (c) { return c.stage !== 'bin' && c.stage !== 'lost'; }).reduce(function (list, c) { return list.concat(requests(c)); }, []); }

  function table(ctx) {
    const everything = all(ctx.all.filter(ctx.match));
    const rows = everything.filter(function (r) { return (!view.status || r.status === view.status) && (!view.who || r.who.indexOf(view.who) === 0); })
      .sort(function (a, b) { return new Date(a.sentAt || 0) - new Date(b.sentAt || 0); });
    const count = function (s) { return everything.filter(function (r) { return r.status === s; }).length; };
    const tile = function (s) {
      return h('button', { type: 'button', class: 'pay-tile' + (view.status === s ? ' on' : ''), onclick: function () { view.status = view.status === s ? '' : s; ctx.update(); } },
        h('span', null, s), h('b', { class: 'num ' + (s === 'Rejected' && count(s) ? 'bad' : '') }, count(s)));
    };
    const style = 'grid-template-columns: minmax(0, 1.6fr) minmax(0, 1.6fr) minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 1.8fr)';
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' },
        h('div', null, h('h1', null, 'Sent for approvals'), h('p', null, 'Everything you have sent for a yes, and what came back')),
        h('div', { style: 'width: 190px' }, Kit.select(['Accounts', 'Design', 'Client', 'SM', 'AVP', 'Founder'], view.who, function (v) { view.who = v; ctx.update(); }, { placeholder: 'Sent to anyone', label: 'Sent to' }))),
      h('div', { class: 'pay-tiles' }, tile('Pending'), tile('Approved'), tile('Rejected'), tile('Overwritten')),
      h('section', { class: 'card list' },
        h('div', { class: 'rows', 'data-keep': 'approvals' },
          h('div', { class: 'row head', style: style }, ['Client', 'What was sent', 'Sent to', 'Amount', 'Sent on', 'Waiting', 'Answer'].map(function (t) { return h('div', null, t); })),
          rows.length ? rows.map(function (r) {
            const days = r.sentAt ? Kit.daysSince(r.sentAt) : 0;
            return h('button', { type: 'button', class: 'row', style: style, onclick: function () { if (r.c.stage === 'post') ctx.goTo('tracker', r.c); else ctx.open(r.c); } },
              h('span', null, h('b', null, r.c.name), ' ', h('span', { class: 'sub' }, r.c.pid)),
              h('span', null, r.what), h('span', null, r.who),
              h('span', { class: 'num' }, r.amount ? Kit.money(r.amount) : ''),
              h('span', null, r.sentAt ? Kit.day(r.sentAt).replace(/ \d{4}$/, '') : 'Not recorded'),
              h('span', { class: r.status === 'Pending' && days >= 2 ? 'bad' : 'sub', style: 'font-size: 14px' }, r.status === 'Pending' ? days + ' day(s)' : ''),
              h('span', { class: 'flexrow' }, Kit.pill(r.status, TONE[r.status]), r.note ? h('span', { class: r.status === 'Rejected' ? 'msg' : 'sub' }, r.note) : null));
          }) : h('div', { class: 'empty' }, 'Nothing here.'))));
  }

  Sales.register({ id: 'approvals', title: 'Sent for approvals', short: 'Approvals', page: true, flow: true, table: table,
    count: function (clients) { return all(clients).filter(function (r) { return r.status === 'Pending'; }).length; },
    summary: function (clients) {
      const list = all(clients);
      const n = function (s) { return list.filter(function (r) { return r.status === s; }).length; };
      return n('Pending') + ' pending · ' + n('Rejected') + ' rejected · ' + n('Approved') + ' approved';
    } });
})();
