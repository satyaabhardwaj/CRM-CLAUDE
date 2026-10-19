// Design · Post-design · the board: one row per client with the designer, the sales manager, the estimated value,
// and three buttons in the order the work happens: EPT, then Appliances, then Design.
// Red = not started, yellow = in progress, green = done. Clicking a button opens that part for the client.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const COLOR = { todo: ['#FBE4E2', '#B3261E', 'Not started'], progress: ['#FFF3CC', '#8A5A00', 'In progress'], done: ['#DDF3E2', '#14602F', 'Done'] };
  D.flowColor = COLOR;
  // One coloured button: the state in colour, the detail in small text under it.
  D.flowButton = function (state, small, onclick, label) {
    const k = COLOR[state];
    return h('button', { type: 'button', onclick: onclick, 'aria-label': label + ': ' + k[2] + (small ? ', ' + small : ''),
      style: 'display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; padding: 7px 10px; border-radius: 9px; border: 1px solid ' + k[1] + '33; background: ' + k[0] + '; color: ' + k[1] + '; cursor: pointer; text-align: left' },
      h('b', { style: 'font-size: 12.5px' }, k[2]), small ? h('small', { style: 'font-size: 11px; opacity: 0.85' }, small) : null);
  };
  D.boardMain = function (ctx, all) {
    const rows = all.filter(L.handed).filter(function (c) { return !c.factoryAt; });
    const grid = 'grid-template-columns: minmax(0, 1.5fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 0.8fr) repeat(3, minmax(0, 1.1fr))';
    const open = function (kind, c) { return function () { ctx.show({ kind: kind, id: c.id }); }; };
    return h('div', { class: 'page', style: 'flex: 1; min-height: 0' },
      h('section', { class: 'card', style: 'flex: 1; min-height: 0; display: flex; flex-direction: column' },
        h('div', { class: 'board-row head', style: grid }, ['Client (' + rows.length + ')', 'Designer', 'Sales manager', 'Est. value', '1 · EPT', '2 · Appliances', '3 · Design'].map(function (t) { return h('div', null, h('b', null, t)); })),
        h('div', { class: 'board-rows', style: 'max-height: none; flex: 1', 'data-keep': 'dboard' }, rows.length ? rows.map(function (c) {
          const s = L.flowState(c);
          return h('div', { class: 'board-row', style: grid + '; cursor: default; align-items: center' },
            h('button', { type: 'button', class: 'who', style: 'border: 0; background: none; text-align: left; cursor: pointer; padding: 0', onclick: open('client', c) },
              h('b', null, c.name), h('small', null, c.pid + ' · ' + L.postStage(c))),
            h('span', null, c.design.designer || 'Not allotted'),
            h('span', null, c.sm || People.owner(c)),
            h('b', { class: 'num' }, Kit.short(L.totals(c).total)),
            D.flowButton(s.ept.state, s.ept.state === 'done' ? 'signed' : s.ept.sent + ' sent · ' + s.ept.returned + ' returned', open('ept', c), 'EPT'),
            D.flowButton(s.appliances.state, s.appliances.state === 'done' ? s.appliances.items + ' item(s), signed' : s.appliances.items + ' item(s) · ' + s.appliances.returned + ' returned', open('appliances', c), 'Appliances'),
            D.flowButton(s.design.state, s.design.state === 'done' ? 'approved' : s.design.sent + ' sent · ' + s.design.returned + ' returned', open('designflow', c), 'Design'));
        }) : h('div', { class: 'empty' }, 'No post-design clients right now.')),
        h('div', { class: 'board-key' }, h('span', { class: 'due' }, 'Red: not started'), h('span', { class: 'notdue' }, 'Yellow: in progress'), h('span', { class: 'paid' }, 'Green: done'), h('span', null, 'Order: EPT, then appliances, then design'))));
  };
})();
