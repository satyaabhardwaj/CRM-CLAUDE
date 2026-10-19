// Master data: every field of every client in one wide table. Opened from the small link at the bottom of the workflow panel.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const STAGE = { qualified: 'Qualified', design: 'In design', token: 'Token due', booked: 'Booked', post: 'Post-design', lost: 'Disqualified', bin: 'In the bin' };

  const ALL = [
    ['Project ID', function (c) { return c.pid; }], ['Customer ID', function (c) { return c.cid; }], ['Customer', function (c) { return c.name; }],
    ['Billing names', function (c) { return c.billing.map(function (b) { return b.name + ' (' + b.id + ')'; }).join(', '); }],
    ['Phone', function (c) { return c.phone; }], ['City', function (c) { return c.city; }], ['Product', function (c) { return c.product; }],
    ['Stage', function (c) { return STAGE[c.stage]; }], ['Sales person', function (c) { return People.owner(c); }],
    ['Source', function (c) { return c.source; }], ['PSM', function (c) { return c.psm; }], ['Segment', function (c) { return c.segment; }],
    ['Priority', function (c) { return c.priority; }], ['Trust', function (c) { return c.trust ? c.trust + '/10' : ''; }],
    ['Budget', function (c) { return c.budget; }], ['Site type', function (c) { return c.siteType; }],
    ['Lead received', function (c) { return Kit.day(c.receivedAt); }], ['First conversation', function (c) { return c.spokeAt ? Kit.day(c.spokeAt) : ''; }],
    ['Designer', function (c) { return c.design.designer; }], ['Proposals', function (c) { return c.design.proposals.length || ''; }], ['Revisions', function (c) { return c.design.revisions.length || ''; }],
    ['Latest proposal', function (c) { const p = c.design.proposals[c.design.proposals.length - 1]; return p ? Kit.money(p.amount) : ''; }],
    ['Client approved', function (c) { return c.approvedAt ? Kit.day(c.approvedAt) : ''; }],
    ['Order value', function (c) { return c.order.products.length ? Kit.money(L.totals(c).total) : ''; }],
    ['Offer basic value', function (c) { return c.order.products.length ? Kit.money(L.totals(c).base) : ''; }],
    ['GST', function (c) { return c.order.products.length ? Kit.money(L.totals(c).tax) : ''; }],
    ['Management discount', function (c) { return c.order.products.length ? Kit.money(L.totals(c).md) : ''; }],
    ['Received in bank (due)', function (c) { return c.order.products.length ? Kit.money(L.totals(c).bank) : ''; }],
    ['Free accessories', function (c) { const f = c.order.products.length ? L.totals(c).freight : 0; return f ? Kit.money(f) : ''; }],
    ['Architect code', function (c) { return c.order.architectCode; }],
    ['Payment plan', function (c) { return c.order.products.length ? c.payment.plan : ''; }],
    ['Booking share', function (c) { return c.order.products.length ? Kit.money(L.bookingDue(c)) : ''; }],
    ['Collected', function (c) { return c.order.products.length ? Kit.money(L.collected(c)) : ''; }],
    ['Still to collect', function (c) { return c.order.products.length ? Kit.money(L.bookingLeft(c)) : ''; }],
    ['Expected by', function (c) { return c.payment.expectedBy ? Kit.day(c.payment.expectedBy) : ''; }],
    ['Timeline', function (c) { return c.timeline.handover ? c.timeline.type : ''; }], ['Handover', function (c) { return c.timeline.handover ? Kit.day(c.timeline.handover) : ''; }],
    ['Timeline approval', function (c) { return c.approvals.timeline; }], ['Booking approval', function (c) { return c.approvals.booking; }],
    ['Next follow-up', function (c) { return c.nextFollowUp ? Kit.when(c.nextFollowUp) : ''; }], ['Calls logged', function (c) { return c.contacts.length || ''; }]
  ];

  // Everything on this screen as one file that opens in Excel.
  function download(rows, COLS) {
    const cell = function (v) { v = v == null ? '' : String(v).replace(/₹/g, '').trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [COLS.map(function (col) { return cell(col[0]); }).join(',')].concat(rows.map(function (c) {
      return COLS.map(function (col) { const v = col[1](c); return cell(/^₹[\d,]+$/.test(String(v)) ? Kit.num(v) : v); }).join(',');
    }));
    const name = 'magppie-crm-' + Kit.today() + '.csv';
    const file = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const plain = function () {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    };
    // On the online copy the page has to ask the viewer before a file is saved. On the laptop it just saves.
    if (!(window.claude && window.claude.use)) return plain();
    window.claude.use('downloads').then(function (d) { return d ? d.save({ filename: name, data: file }) : plain(); }).catch(function () {});
  }

  const HIDDEN = ['Management discount', 'Free accessories'];
  function table(ctx) {
    const COLS = Kit.bankOnly() ? ALL.filter(function (col) { return HIDDEN.indexOf(col[0]) < 0; }) : ALL;
    const rows = ctx.clients.slice().sort(function (a, b) { return a.pid < b.pid ? -1 : 1; });
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' }, h('div', null, h('h1', null, 'Master data'), h('p', null, rows.length + ' clients · ' + COLS.length + ' fields · scroll sideways · click a row to open the client')),
        Kit.btn('Download all', function () { download(rows, COLS); }, 'dark')),
      h('section', { class: 'card master', 'data-keep': 'master' }, h('table', null,
        h('thead', null, h('tr', null, COLS.map(function (col) { return h('th', { scope: 'col' }, col[0]); }))),
        h('tbody', null, rows.map(function (c) {
          // A client past the booking share has no stage screen of their own, so they open in the client tracker.
          const open = function () { if (['qualified', 'design', 'token', 'booked'].indexOf(c.stage) >= 0) ctx.open(c); else if (c.stage === 'post') ctx.goTo('tracker', c); };
          return h('tr', { onclick: open }, COLS.map(function (col) { const v = col[1](c); return h('td', null, v == null ? '' : String(v)); }));
        })))));
  }

  Sales.register({ id: 'master', title: 'Master data', short: 'Data', page: true, small: true, table: table });
})();
