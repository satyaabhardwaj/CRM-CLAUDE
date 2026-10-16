// Dashboard · Client tracker. One row per client, one column per stage, with the money and the date in each.
// After the booking share is collected the designer becomes the client's point of contact, but the client still
// calls the sales person. This screen lets the sales person answer: where is it, who has it, what is paid, what is next.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const ALLCOLS = ['Token', 'Booking', 'EPT', 'Production drawing', 'PDI', 'Dispatch', 'Handover'];
  const PLAN_NAME = { EPT: 'EPT', 'Production drawing': 'Production', PDI: 'PDI', Handover: 'EHOD' };
  const DATE_KEY = { 'Production drawing': 'signoff', PDI: 'pdi', Dispatch: 'dispatch', Handover: 'handover' };
  const WHEN = [['all', 'Overall'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']];
  const DUE = [['all', 'Overall'], ['due', 'Due'], ['notdue', 'Not due']];
  const WORD = { paid: 'Paid', due: 'Due now', notdue: 'Not due yet' };
  const view = { when: 'all', due: 'all' };

  function onBoard(c) { return ['token', 'booked', 'post'].indexOf(c.stage) >= 0; }
  function short(d) { return d ? Kit.day(d).replace(/ \d{4}$/, '') : ''; }
  function inDates(c) {
    if (view.when === 'all') return true;
    const now = new Date();
    const got = Kit.ymd(new Date(c.approvedAt || c.receivedAt));
    let from = Kit.today();
    if (view.when === 'week') { const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); from = Kit.ymd(start); }
    if (view.when === 'month') from = Kit.ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    return got >= from && got <= Kit.today();
  }

  // Who the client deals with: the sales person until the booking share is in, the designer after that.
  function poc(c) {
    const handed = c.stage === 'post' || (c.stage === 'booked' && L.bookingLeft(c) === 0);
    if (!handed) return ['You', 'until booking share is collected'];
    return [c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted', 'point of contact now'];
  }
  // Where the client is now. Past the booking share, the position follows the planned dates.
  function nowAt(c) {
    if (c.stage === 'booked' && !L.tokenIn(c)) return ['Token', 'red'];
    if (c.stage === 'booked' && L.bookingLeft(c) > 0) return ['Booking', 'yellow'];
    const d = L.dates(c);
    const today = Kit.today();
    if (!d) return ['With designer', 'blue'];
    if (today < d.signoff) return ['Production drawing', 'blue'];
    if (today < d.pdi) return ['PDI', 'blue'];
    if (today < d.dispatch) return ['Dispatch', 'blue'];
    return [today < d.handover ? 'Handover' : 'Handed over', 'green'];
  }

  // One cell: the amount for that stage, its date, and whether it is paid, due now, or not due yet.
  function cell(c, col) {
    const d = L.dates(c);
    if (col === 'Token') {
      const paid = c.payment.receipts.filter(function (r) { return r.status === 'Confirmed'; })[0];
      const sent = c.payment.receipts.filter(function (r) { return r.status === 'Requested'; })[0];
      if (paid) return { amount: Number(paid.amount) || 0, state: 'paid', date: paid.date };
      return { amount: sent ? Number(sent.amount) || 0 : 0, state: 'due', text: sent ? null : 'Due', date: sent ? sent.date : '', note: sent ? 'with Accounts' : '' };
    }
    if (col === 'Booking') {
      const left = L.bookingLeft(c);
      return left > 0 ? { amount: left, state: 'due', date: c.payment.expectedBy, note: 'left' } : { amount: L.bookingDue(c), state: 'paid', date: c.bookedAt };
    }
    const share = L.shares(c).filter(function (s) { return s.name === PLAN_NAME[col]; })[0];
    const date = d && DATE_KEY[col] ? d[DATE_KEY[col]] : '';
    if (!share && !date) return null;
    return { amount: share ? share.amount : 0, state: 'notdue', date: date, text: share ? null : ' ' };
  }
  function shows(x) { return x && (view.due === 'all' || x.state === view.due); }

  function table(ctx) {
    const rows = ctx.all.filter(function (c) { return onBoard(c) && inDates(c) && ctx.match(c); });
    const basic = rows.reduce(function (t, c) { return t + L.totals(c).base; }, 0);
    const COLS = Kit.bankOnly() ? ALLCOLS.filter(function (x) { return x !== 'Token'; }) : ALLCOLS;
    const grid = 'grid-template-columns: minmax(0, 1.9fr) minmax(0, 1.2fr) minmax(0, 1.2fr) repeat(' + COLS.length + ', minmax(0, 1fr)) minmax(0, 1.1fr)';
    const heads = COLS.map(function (col) {
      const hit = rows.map(function (c) { return cell(c, col); }).filter(function (x) { return shows(x) && x.amount; });
      const total = hit.reduce(function (t, x) { return t + x.amount; }, 0);
      return h('div', null, h('b', null, col), h('span', { class: 'box' + (hit.length ? '' : ' none') }, hit.length ? Kit.lakh(total) + ' (' + hit.length + ')' : 'None'));
    });
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' },
        h('div', null, h('h1', null, 'Client tracker'), h('p', null, 'Where each client is, who has them, what is paid and what date is next · Offer basic value ' + Kit.short(basic) + ' · amounts in ₹ lakh')),
        h('div', { class: 'flexrow' },
          h('div', { style: 'width: 150px' }, Kit.select(WHEN, view.when, function (v) { view.when = v; ctx.update(); }, { placeholder: false, label: 'Date' })),
          h('div', { style: 'width: 130px' }, Kit.select(DUE, view.due, function (v) { view.due = v; ctx.update(); }, { placeholder: false, label: 'Due or not due' })))),
      h('section', { class: 'card', style: 'flex: 1' },
        h('div', { class: 'board-row head', style: grid }, h('div', null, h('b', null, 'Client'), h('span', { class: 'box' }, '(' + rows.length + ')')), h('div', null, h('b', null, 'Now at')), h('div', null, h('b', null, 'Point of contact')), heads, h('div', null, h('b', null, 'Paid of order'))),
        h('div', { class: 'board-rows', 'data-keep': 'board' }, rows.length ? rows.map(function (c) {
          const at = nowAt(c), who = poc(c), total = L.totals(c).total, got = L.collected(c);
          return h('button', { type: 'button', class: 'board-row' + (ctx.isOpen && ctx.selected && ctx.selected.id === c.id ? ' on' : ''), style: grid, onclick: function () { ctx.select(c.id); } },
            h('span', { class: 'who' }, h('b', null, c.name), h('small', null, c.pid + ' · ' + c.product + ' · ' + c.payment.plan + ' plan')),
            h('span', null, Kit.pill(at[0], at[1])),
            h('span', { class: 'who' }, h('b', null, who[0]), h('small', null, who[1])),
            COLS.map(function (col) {
              const x = cell(c, col);
              if (!shows(x)) return h('span', { class: 'nil' }, '');
              return h('span', { class: 'tl-cell', title: col + ' · ' + WORD[x.state] },
                h('b', { class: 'num ' + x.state }, x.text || Kit.lakh(x.amount)),
                h('small', null, [short(x.date), x.note].filter(Boolean).join(' · ')));
            }),
            h('span', { class: 'who' }, h('b', { class: 'num' }, Kit.lakh(got) + ' of ' + Kit.lakh(total)), h('small', null, total ? Math.round(got / total * 100) + '% paid' : '')));
        }) : h('div', { class: 'empty' }, 'No clients have reached the token stage in this period.')),
        h('div', { class: 'board-key' }, h('span', { class: 'paid' }, 'Paid'), h('span', { class: 'due' }, 'Due now'), h('span', { class: 'notdue' }, 'Not due yet'), h('span', { class: 'notdue' }, 'The date under each amount is when it was paid or when it is planned'))));
  }

  // Everything about one client on one screen, for when the client calls.
  function sheet(c, ctx) {
    const at = nowAt(c), who = poc(c), d = L.dates(c), t = L.totals(c);
    const fact = function (label, value, bad) { return h('div', null, h('span', null, label), h('b', { class: bad ? 'bad' : '' }, value || 'Not yet')); };
    return [
      h('div', { class: 'sheet-h' },
        h('div', null, h('div', { class: 'flexrow' }, h('h2', null, c.name), Kit.pill('Now at ' + at[0], at[1])),
          h('div', { class: 'sub', style: 'font-size: 13px; margin-top: 4px' }, c.pid + ' · ' + c.cid + ' · ' + c.city + ' · ' + c.product + (c.phone ? ' · ' + c.phone : ''))),
        Kit.btn('Close', ctx.close, 'small')),
      h('div', { class: 'cols' },
        Kit.card('Who has this client', '', 'violet', h('div', { class: 'facts' },
          fact('Point of contact', who[0]), fact('Designer allotted', c.design.designer),
          fact('Sales person', People.owner(c)), fact('Now at', at[0]),
          fact('Timeline', d ? c.approvals.timeline : ''), fact('Booking approval', c.approvals.booking)),
          (c.news || []).slice(0, 3).map(function (n) { return h('div', { class: 'hint' }, Kit.dayTime(n.at) + ' · ' + n.text); })),
        Kit.card('Money', '', 'green', h('div', { class: 'facts' },
          fact('Order value', Kit.money(t.total)), fact('Payment plan', L.PLANS[c.payment.plan].label),
          fact('Paid so far', Kit.money(L.collected(c))), fact('Booking amount left', Kit.money(L.bookingLeft(c)), L.bookingLeft(c) > 0)),
          c.payment.receipts.length ? c.payment.receipts.map(function (r) {
            return h('div', { class: 'line rule' }, h('span', null, h('b', { class: 'num' }, Kit.money(r.amount)), h('span', { class: 'sub' }, ' · ' + Kit.day(r.date) + ' · ' + (r.mode || 'Mode not set'))), Kit.pill(r.status, { Confirmed: 'green', Requested: 'blue', Rejected: 'red' }[r.status]));
          }) : h('div', { class: 'hint' }, 'No payment has been recorded.')),
        Kit.card('Stages and dates', '', 'blue', (Kit.bankOnly() ? ALLCOLS.filter(function (x) { return x !== 'Token'; }) : ALLCOLS).map(function (col) {
          const x = cell(c, col);
          return h('div', { class: 'line rule' },
            h('span', null, h('b', null, col), x && x.date ? h('span', { class: 'sub' }, ' · ' + Kit.day(x.date)) : null),
            x ? h('span', { class: 'flexrow' }, x.amount ? h('span', { class: 'num' }, Kit.money(x.amount)) : null, Kit.pill(WORD[x.state], { paid: 'green', due: 'red', notdue: 'grey' }[x.state])) : h('span', { class: 'sub' }, 'No payment at this stage'));
        })))
    ];
  }

  Sales.register({ id: 'tracker', title: 'Client tracker', short: 'Tracker', page: true, table: table, sheet: sheet,
    summary: function (all) {
      const rows = all.filter(onBoard);
      const handed = rows.filter(function (c) { return poc(c)[0] !== 'You'; }).length;
      return rows.length + ' clients · ' + handed + ' with a designer · ' + Kit.short(rows.reduce(function (t, c) { return t + L.bookingLeft(c); }, 0)) + ' due';
    } });
})();
