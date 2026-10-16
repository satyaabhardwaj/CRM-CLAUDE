// Architects, for Sales only.
//   1. The master list: every architect with firm, phone and commission rate. Sales can add, edit and remove.
//   2. The picker used on a client: tick "An architect is involved", choose the architect, and the name and
//      commission rate are filled in by themselves.
// Money, as Manish set it out: the architect's fee (success fee) = offer basic value x commission rate.
// It is already inside the offer basic value the client is given. The client is never shown it.
// It is a cost on Magppie's side, and the net inflow is worked out after taking it off.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = {};
  A.list = function () { const d = Kit.store.data; d.architects = d.architects || []; return d.architects; };
  A.find = function (id) { return A.list().filter(function (a) { return a.id === id; })[0] || null; };
  A.of = function (c) { return c.architectInvolved ? A.find(c.architectId) : null; };
  // Put an architect on a client: the name and the commission rate go onto the order.
  A.put = function (c, a) {
    c.architectInvolved = true;
    c.architectId = a ? a.id : '';
    c.order.architectCode = a ? a.name : '';
    c.order.archPct = a ? Number(a.rate) || 0 : 0;
  };
  A.clear = function (c) { c.architectInvolved = false; c.architectId = ''; c.order.architectCode = ''; c.order.archPct = 0; };

  // The tick box and the dropdown. `get` and `set` let the same piece work on a saved client and on a new, unsaved one.
  A.picker = function (on, id, onTick, onPick) {
    const a = A.find(id);
    const options = A.list().slice().sort(function (x, y) { return x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1; })
      .map(function (x) { return [x.id, x.name + (x.firm ? ' · ' + x.firm : '') + ' · ' + (Number(x.rate) || 0) + '%']; });
    return h('div', { class: 'soft' },
      h('label', { class: 'flexrow' }, h('input', { type: 'checkbox', checked: !!on, onchange: function () { onTick(!on); } }), h('b', null, 'An architect is involved')),
      !on ? null : Kit.field('Architect', Kit.select(options, id, onPick, { placeholder: 'Choose the architect', label: 'Architect' })),
      !on || !a ? null : h('div', { class: 'facts' },
        h('div', null, h('span', null, 'Firm'), h('b', null, a.firm || 'Not given')),
        h('div', null, h('span', null, 'Phone'), h('b', null, a.phone || 'Not given')),
        h('div', null, h('span', null, 'Commission'), h('b', null, (Number(a.rate) || 0) + '%'))),
      !on ? null : h('div', { class: 'sub' }, 'The fee is inside the offer basic value. The client is not shown it.'));
  };
  A.forClient = function (c, ctx) {
    return A.picker(c.architectInvolved, c.architectId,
      function (now) { ctx.update(function () { if (now) A.put(c, A.find(c.architectId)); else A.clear(c); }); },
      function (id) { ctx.update(function () { A.put(c, A.find(id)); }); });
  };

  // The master list, as its own screen in Sales.
  const draft = { name: '', firm: '', phone: '', rate: '' };
  let find = '';
  function table(ctx) {
    if (Kit.bankOnly()) return h('div', { class: 'page' }, h('div', { class: 'empty' }, 'Not shown in this view.'));
    const list = A.list();
    const used = function (a) { return ctx.everyone.filter(function (c) { return c.architectInvolved && c.architectId === a.id && c.stage !== 'bin'; }); };
    const q = find.trim().toLowerCase();
    const rows = list.filter(function (a) { return !q || (a.name + ' ' + a.firm + ' ' + a.phone).toLowerCase().indexOf(q) >= 0; })
      .sort(function (x, y) { return x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1; });
    const style = 'grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1fr) 110px minmax(0, 0.6fr) minmax(0, 1fr) minmax(0, 1fr) 90px';
    const set = function (a, key, isNum) { return function (v) { ctx.update(function () {
      a[key] = isNum ? Kit.num(v) : v.trim();
      // A changed rate or name follows onto every client of this architect, so the fees stay right.
      ctx.everyone.forEach(function (c) { if (c.architectInvolved && c.architectId === a.id) A.put(c, a); });
    }); }; };
    const search = h('input', { type: 'search', placeholder: 'Find an architect', 'aria-label': 'Find an architect', style: 'width: 200px' });
    search.value = find;
    search.addEventListener('input', function () { find = search.value; ctx.update(); });
    return h('div', { class: 'page' },
      h('div', { class: 'page-h' }, h('div', null, h('h1', null, 'Architects'), h('p', null, list.length + ' architects · the list every "Architect" dropdown in Sales reads from · you can edit anything here')), search),
      h('section', { class: 'card', style: 'padding: 12px 16px; flex: none' }, h('div', { class: 'flexrow' },
        h('span', { style: 'flex: 1.4' }, Kit.input(draft.name, function (v) { draft.name = v; }, { placeholder: 'Architect name', label: 'New architect name' })),
        h('span', { style: 'flex: 1.4' }, Kit.input(draft.firm, function (v) { draft.firm = v; }, { placeholder: 'Firm', label: 'New architect firm' })),
        h('span', { style: 'flex: 1' }, Kit.input(draft.phone, function (v) { draft.phone = v; }, { type: 'tel', placeholder: 'Phone', label: 'New architect phone' })),
        h('span', { style: 'width: 120px' }, Kit.input(draft.rate, function (v) { draft.rate = v; }, { placeholder: 'Commission %', label: 'New architect commission' })),
        Kit.btn('Add architect', function () {
          if (!draft.name.trim()) return;
          ctx.update(function () {
            const n = list.reduce(function (m, a) { return Math.max(m, Number(String(a.id).replace('a', '')) || 0); }, 0) + 1;
            list.push({ id: 'a' + String(n).padStart(3, '0'), name: draft.name.trim(), firm: draft.firm.trim(), phone: draft.phone.trim(), rate: Kit.num(draft.rate) });
            draft.name = draft.firm = draft.phone = draft.rate = '';
          });
        }, 'dark'))),
      h('section', { class: 'card list' }, h('div', { class: 'rows', 'data-keep': 'architects' },
        h('div', { class: 'row head', style: style }, ['Architect', 'Firm', 'Phone', 'Commission %', 'Orders', 'Order value', 'Success fees', ''].map(function (t) { return h('div', null, t); })),
        rows.length ? rows.map(function (a) {
          const mine = used(a);
          const value = mine.reduce(function (t, c) { return t + L.totals(c).base; }, 0), fees = mine.reduce(function (t, c) { return t + L.totals(c).success; }, 0);
          return h('div', { class: 'row', style: style + '; cursor: default' },
            Kit.input(a.name, set(a, 'name'), { label: 'Architect name' }),
            Kit.input(a.firm, set(a, 'firm'), { label: 'Firm', placeholder: 'Firm' }),
            Kit.input(a.phone, set(a, 'phone'), { type: 'tel', label: 'Phone', placeholder: 'Phone' }),
            Kit.input(a.rate, set(a, 'rate', true), { label: 'Commission percent', placeholder: '0' }),
            h('span', { class: 'num' }, mine.length || ''),
            h('span', { class: 'num' }, value ? Kit.short(value) : ''),
            h('span', { class: 'num' }, fees ? Kit.short(fees) : ''),
            mine.length ? h('span', { class: 'sub' }, 'In use') : Kit.btn('Remove', function () { ctx.update(function () { list.splice(list.indexOf(a), 1); }); }, 'small'));
        }) : h('div', { class: 'empty' }, 'No architect matches.'))));
  }

  window.Architects = A;
  Sales.register({ id: 'architects', title: 'Architects', short: 'Architects', page: true, small: true, table: table,
    label: function () { return 'Architects (' + A.list().length + ')'; } });
})();
