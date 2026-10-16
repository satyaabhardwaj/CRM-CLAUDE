// The bin. Deleting never destroys anything: a client or a follow-up goes to the bin and can be put back.
(function () {
  const h = Kit.h;
  const B = {};

  // Delete whole clients from a list.
  B.clients = function (ctx) {
    return {
      redraw: function () { ctx.update(); },
      remove: function (ids) {
        ctx.update(function () {
          ctx.all.forEach(function (c) {
            if (ids.indexOf(c.id) < 0) return;
            c.binned = { at: Kit.now(), stage: c.stage };
            c.stage = 'bin';
          });
        });
      }
    };
  };

  // Delete only the follow-up call. The client stays where it is.
  B.followUps = function (ctx) {
    return {
      redraw: function () { ctx.update(); },
      remove: function (ids) {
        ctx.update(function () {
          ctx.all.forEach(function (c) {
            if (ids.indexOf(c.id) < 0) return;
            c.binnedCall = { at: Kit.now(), nextFollowUp: c.nextFollowUp || '', retry: c.retry || null };
            c.nextFollowUp = '';
            c.retry = null;
          });
        });
      }
    };
  };

  function inBin(all) { return all.filter(function (c) { return c.stage === 'bin' && c.binned; }); }
  function callsInBin(all) { return all.filter(function (c) { return c.binnedCall && c.stage !== 'bin'; }); }
  const STAGE = { qualified: 'Qualified leads', design: 'In design', token: 'Token due', booked: 'Booked', post: 'Post-design', lost: 'Disqualified' };

  function table(ctx) {
    const clients = inBin(ctx.all).sort(function (a, b) { return new Date(b.binned.at) - new Date(a.binned.at); });
    const calls = callsInBin(ctx.all).sort(function (a, b) { return new Date(b.binnedCall.at) - new Date(a.binnedCall.at); });
    const row = function (c, sub, restore) {
      return h('div', { class: 'mini', style: 'cursor: default' }, h('span', { class: 'who' }, h('b', null, c.name), h('small', null, sub)), Kit.btn('Restore', restore, 'small line'));
    };
    const back = function (c) { return function () { ctx.update(function () { c.stage = c.binned.stage; delete c.binned; }); }; };
    const callBack = function (c) { return function () { ctx.update(function () { c.nextFollowUp = c.binnedCall.nextFollowUp; c.retry = c.binnedCall.retry; delete c.binnedCall; }); }; };
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' }, h('div', null, h('h1', null, 'Bin'), h('p', null, 'Nothing here is lost. Restore puts it back exactly where it was.')),
        clients.length + calls.length ? Kit.btn('Restore everything', function () { ctx.update(function () { clients.forEach(function (c) { c.stage = c.binned.stage; delete c.binned; }); calls.forEach(function (c) { c.nextFollowUp = c.binnedCall.nextFollowUp; c.retry = c.binnedCall.retry; delete c.binnedCall; }); }); }, 'line') : null),
      h('div', { class: 'twolists' },
        h('section', { class: 'card list' }, h('div', { class: 'list-h' }, h('h1', null, 'Deleted clients', h('span', { class: 'count' }, clients.length))),
          h('div', { class: 'rows' }, clients.length ? clients.map(function (c) { return row(c, 'From ' + (STAGE[c.binned.stage] || c.binned.stage) + ' · deleted ' + Kit.dayTime(c.binned.at), back(c)); }) : h('div', { class: 'empty' }, 'No deleted clients.'))),
        h('section', { class: 'card list' }, h('div', { class: 'list-h' }, h('h1', null, 'Deleted follow-up calls', h('span', { class: 'count' }, calls.length))),
          h('div', { class: 'rows' }, calls.length ? calls.map(function (c) { return row(c, (c.binnedCall.nextFollowUp ? 'Was due ' + Kit.day(c.binnedCall.nextFollowUp) : 'Call-again timer') + ' · deleted ' + Kit.dayTime(c.binnedCall.at), callBack(c)); }) : h('div', { class: 'empty' }, 'No deleted follow-up calls.')))));
  }

  window.SalesBin = B;
  // Registered last (from index.html), so the Bin link comes after Master data in the workflow panel.
  B.register = function () {
    Sales.register({ id: 'bin', title: 'Bin', short: 'Bin', page: true, small: true, table: table,
      label: function (all) { return 'Bin (' + (inBin(all).length + callsInBin(all).length) + ')'; } });
  };
})();
