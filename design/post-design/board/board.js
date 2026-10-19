// Design · Post-design · the board: one row per client with the designer, the sales manager, the estimated value,
// and five buttons in the order the work happens (19 Oct 2026): first site measurement, design, appliances, EPT, PDI.
// Red = not started, yellow = in progress, green = done. Clicking a button opens that part for the client.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const COLOR = { todo: ['#FBE4E2', '#B3261E', 'Not started'], progress: ['#FFF3CC', '#8A5A00', 'In progress'], done: ['#DDF3E2', '#14602F', 'Done'] };
  D.flowColor = COLOR;
  // One coloured button: the state in colour, the detail in small text under it.
  // `word` replaces the plain state word when a step has its own (Sent, Aligned for the site measurement).
  D.flowButton = function (state, small, onclick, label, word) {
    const k = COLOR[state];
    return h('button', { type: 'button', onclick: onclick, 'aria-label': label + ': ' + (word || k[2]) + (small ? ', ' + [].concat(small).join(', ') : ''),
      style: 'display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; padding: 7px 10px; border-radius: 9px; border: 1px solid ' + k[1] + '33; background: ' + k[0] + '; color: ' + k[1] + '; cursor: pointer; text-align: left' },
      h('b', { style: 'font-size: 12.5px' }, word || k[2]), (Array.isArray(small) ? small : (small ? [small] : [])).map(function (line) { return h('small', { style: 'font-size: 11px; opacity: 0.85' }, line); }));
  };
  // The PDI step as a colour: red until design, appliances and EPT are done, yellow while it waits, green once approved.
  D.pdiState = function (c) { const p = L.flow(c).pdi; return p.approvedAt ? 'done' : (L.readyForPdi(c) ? 'progress' : 'todo'); };
  D.boardMain = function (ctx, all) {
    const rows = all.filter(L.handed).filter(function (c) { return !c.factoryAt; });
    const grid = 'grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.8fr) minmax(0, 0.8fr) minmax(0, 0.7fr) repeat(5, minmax(0, 1fr))';
    const open = function (kind, c) { return function () { ctx.show({ kind: kind, id: c.id }); }; };
    return h('div', { class: 'page', style: 'flex: 1; min-height: 0' },
      h('section', { class: 'card', style: 'flex: 1; min-height: 0; display: flex; flex-direction: column' },
        h('div', { class: 'board-row head', style: grid }, ['Client (' + rows.length + ')', 'Designer', 'Sales manager', 'Est. value', '1 · Site measurement', '2 · Design', '3 · Appliances', '4 · EPT', '5 · PDI'].map(function (t) { return h('div', null, h('b', null, t)); })),
        h('div', { class: 'board-rows', style: 'max-height: none; flex: 1', 'data-keep': 'dboard' }, rows.length ? rows.map(function (c) {
          const s = L.flowState(c), m = L.measureState(c), pdi = L.flow(c).pdi, ps = D.pdiState(c);
          return h('div', { class: 'board-row', style: grid + '; cursor: default; align-items: center' },
            h('button', { type: 'button', class: 'who', style: 'border: 0; background: none; text-align: left; cursor: pointer; padding: 0', onclick: open('client', c) },
              h('b', null, c.name), h('small', null, c.pid + ' · ' + L.postStage(c))),
            h('span', null, c.design.designer || 'Not allotted'),
            h('span', null, c.sm || People.owner(c)),
            h('b', { class: 'num' }, Kit.short(L.totals(c).total)),
            h('div', null, D.flowButton(m.state, D.measureSmall(m), open('measure', c), 'Site measurement', m.step),
              m.note ? h('small', { class: 'sub', style: 'display: block; margin-top: 3px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis' }, 'Note: ' + m.note) : null),
            D.flowButton(s.design.state, s.design.state === 'done' ? 'approved' : s.design.sent + ' sent · ' + s.design.returned + ' returned', open('designflow', c), 'Design'),
            D.flowButton(s.appliances.state, s.appliances.state === 'done' ? s.appliances.items + ' item(s), signed' : s.appliances.items + ' item(s) · ' + s.appliances.returned + ' returned', open('appliances', c), 'Appliances'),
            D.flowButton(s.ept.state, s.ept.state === 'done' ? 'signed' : s.ept.sent + ' sent · ' + s.ept.returned + ' returned', open('ept', c), 'EPT'),
            D.flowButton(ps, ps === 'done' ? 'approved ' + D.short(pdi.approvedAt) : (ps === 'progress' ? 'waiting for the last PDI' : 'after steps 2 to 4'), open('pdi', c), 'PDI', ps === 'progress' ? 'Pending' : null));
        }) : h('div', { class: 'empty' }, 'No post-design clients right now.')),
        h('div', { class: 'board-key' }, h('span', { class: 'due' }, 'Red: not started'), h('span', { class: 'notdue' }, 'Yellow: in progress'), h('span', { class: 'paid' }, 'Green: done'), h('span', null, 'Order: site measurement, design, appliances, EPT, PDI'))));
  };
})();
