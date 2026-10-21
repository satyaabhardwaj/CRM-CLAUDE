// Master data: every field of every client in one wide table, with one file to download.
// It belongs to Accounts only. Sales and Design do not have it.
(function () {
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
  const MORE = [
    ['Area (sq ft)', function (c) { return c.design.brief.sqft; }],
    ['Came to Design', function (c) { return c.design.stepAt ? Kit.day(c.design.stepAt) : ''; }],
    ['Booked on', function (c) { return c.bookedAt ? Kit.day(c.bookedAt) : ''; }],
    ['OCF date', function (c) { return c.ocfAt ? Kit.day(c.ocfAt) : ''; }],
    ['Post-design stage', function (c) { return L.handed(c) ? L.postStage(c) : ''; }],
    ['Drawing signed off', function (c) { return c.drawingSignedAt ? Kit.day(c.drawingSignedAt) : ''; }],
    ['To collect for 80%', function (c) { const r = L.productionRow(c); return c.order.products.length && r ? Kit.money(r.due) : ''; }],
    ['In factory since', function (c) { return c.factoryAt ? Kit.day(c.factoryAt) : ''; }],
    ['Planned signoff', function (c) { const d = L.dates(c); return d ? Kit.day(d.signoff) : ''; }],
    ['PDI', function (c) { const d = L.dates(c); return d ? Kit.day(d.pdi) : ''; }],
    ['Dispatch', function (c) { const d = L.dates(c); return d ? Kit.day(d.dispatch) : ''; }]
  ];
  const HIDDEN = ['Management discount', 'Free accessories'];

  window.AccountsMasterColumns = ALL.concat(MORE);
})();
