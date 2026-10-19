// Accounts · Approvals: the four Accounts gates (19 Oct 2026). A client shows here once the money for a gate is in;
// nothing moves on until Accounts clicks Approve. 50% -> Design, 80% -> production drawing, 80% + PDI -> factory, 100% -> dispatch.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  A.readyRows = function (all, key) { return all.filter(A.hasOrder).filter(function (c) { return L.gate(c, key).ready; }); };
  A.approvalsCount = function (all) { return L.GATES.reduce(function (n, g) { return n + A.readyRows(all, g[0]).length; }, 0); };
  A.approvalsMain = function (ctx) {
    return h('div', { class: 'twolists', style: 'grid-template-columns: repeat(4, minmax(0, 1fr))' }, L.GATES.map(function (x) {
      const rows = A.readyRows(ctx.all, x[0]);
      return Kit.list(x[1], null, rows.map(function (c) {
        const g = L.gate(c, x[0]);
        return { name: c.name, sub: People.owner(c) + ' · ' + Kit.short(g.got) + ' of ' + Kit.short(L.totals(c).total) + ' in · needs ' + g.pct + '%',
          pill: Kit.pill('Ready', 'blue'), pick: function () { ctx.show({ kind: 'expected', id: c.id }); } };
      }), x[0] === 'factory' ? 'Nothing ready. Needs 80% in and the PDI approved.' : 'Nothing ready to approve.');
    }));
  };
})();
