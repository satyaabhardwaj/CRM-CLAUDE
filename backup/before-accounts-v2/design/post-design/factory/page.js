// Design · Post-design · Shoot to factory: PDI approved and collection done -> the order goes to the factory by itself
// and the factory is emailed (shared/rules.js, L.toFactory). This page shows what is waiting and what has gone.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  D.factoryWaiting = function (all) { return all.filter(L.handed).filter(function (c) { return !c.factoryAt && L.flow(c).pdi.approvedAt; }); };
  D.factoryGone = function (all) { return all.filter(function (c) { return !!c.factoryAt; }); };
  D.mailLine = function (c) {
    const m = c.factoryMail;
    if (!m) return 'factory email: not sent';
    return m.state === 'sent' ? 'factory emailed' + (m.test ? ' (test mode)' : '') : (m.state === 'sending' ? 'emailing the factory…' : 'factory email not sent: ' + (m.why || ''));
  };
  D.factoryMain = function (ctx, all) {
    const waiting = D.factoryWaiting(all), gone = D.factoryGone(all).sort(function (a, b) { return a.factoryAt < b.factoryAt ? 1 : -1; });
    const see = function (c) { return function () { ctx.show({ kind: 'client', id: c.id }); }; };
    return h('div', { class: 'twolists' },
      Kit.list('Ready · waiting for the 30%', h('span', { class: 'sub' }, 'PDI approved'), waiting.map(function (c) {
        return { name: c.name, sub: (c.design.designer || 'No designer') + ' · PDI approved ' + Kit.day(L.flow(c).pdi.approvedAt), pill: Kit.pill(Kit.short(L.productionRow(c).due) + ' to collect', 'red'), pick: see(c) };
      }), 'Nothing waiting. Orders go to the factory by themselves once the 30% is in.'),
      Kit.list('Shot to factory', h('span', { class: 'sub' }, gone.length + ' order(s)'), gone.map(function (c) {
        return { name: c.name, sub: 'since ' + Kit.day(c.factoryAt) + ' · ' + D.mailLine(c) + ' · ' + L.postStage(c), pill: Kit.pill(L.postStage(c), 'green'), pick: see(c) };
      }), 'No orders in the factory yet.'));
  };
})();
