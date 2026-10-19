// Accounts · Clients: every order in one table, searchable by name, project or customer number.
// For each: total payable, bank and management (received of due), % received, balance, team, and the next approval with what it still needs.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  const S = { q: '' };
  A.clientsMain = function (ctx) {
    const q = S.q.trim().toLowerCase();
    const rows = ctx.all.filter(A.hasOrder).filter(function (c) { return !q || (c.name + ' ' + c.pid + ' ' + c.cid).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    const bank = !Kit.bankOnly();
    const grid = 'grid-template-columns: minmax(0, 1.6fr) repeat(' + (bank ? 5 : 4) + ', minmax(0, 1fr)) minmax(0, 0.6fr) minmax(0, 1.8fr)';
    const cell = function (big, small, cls) { return h('span', { class: 'tl-cell' }, h('b', { class: 'num ' + (cls || '') }, big), small ? h('small', null, small) : null); };
    const sum = function (f) { return rows.reduce(function (n, c) { return n + f(A.money(c)); }, 0); };
    return h('div', { class: 'page', style: 'flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px' },
      h('div', { class: 'flexrow' },
        h('span', { style: 'width: 320px' }, Kit.input(S.q, function (v) { S.q = v; ctx.update(); }, { placeholder: 'Search a client, then press Enter', label: 'Search clients' })),
        S.q ? Kit.btn('Clear', function () { S.q = ''; ctx.update(); }, 'small') : null,
        h('span', { class: 'sub' }, rows.length + ' order(s) · total ' + Kit.short(sum(function (m) { return m.t.total; })) + ' · received ' + Kit.short(sum(function (m) { return m.paid; })) + ' · balance ' + Kit.short(sum(function (m) { return m.balance; })))),
      h('section', { class: 'card', style: 'flex: 1; min-height: 0; display: flex; flex-direction: column' },
        h('div', { class: 'board-row head', style: grid }, ['Client', 'Total payable', 'Bank', bank ? 'Management' : null, 'Received', 'Balance', 'Team', 'Next approval'].filter(Boolean).map(function (t) { return h('div', null, h('b', null, t)); })),
        h('div', { class: 'board-rows', style: 'max-height: none; flex: 1', 'data-keep': 'aclients' }, rows.length ? rows.map(function (c) {
          const m = A.money(c), g = A.nextGate(c);
          return h('button', { type: 'button', class: 'board-row', style: grid, onclick: function () { ctx.show({ kind: 'expected', id: c.id }); } },
            h('span', { class: 'who' }, h('b', null, c.name), h('small', null, c.pid + ' · ' + People.owner(c))),
            cell(Kit.lakh(m.t.total), 'OBV ' + Kit.lakh(m.t.base)),
            cell(Kit.lakh(m.bankGot), 'of ' + Kit.lakh(m.t.bank), m.bankDue ? 'due' : 'paid'),
            bank ? cell(Kit.lakh(m.mgmtGot), 'of ' + Kit.lakh(m.t.mgmt), m.mgmtDue ? 'due' : 'paid') : null,
            cell(A.pctText(m.pct), Kit.lakh(m.paid) + ' in', m.pct >= 100 ? 'paid' : ''),
            cell(Kit.lakh(m.balance), '', m.balance ? 'due' : 'paid'),
            h('span', null, A.team(c)),
            h('span', { class: 'who' }, h('b', null, g ? g.label : 'All done'), h('small', null, A.nextLine(c))));
        }) : h('div', { class: 'empty' }, q ? 'No client matches "' + S.q + '".' : 'No orders yet.'))),
      h('div', { class: 'hint' }, 'Amounts in lakhs, 2 decimals. Team: under 50% received the order is with Sales, from 50% with Design.'));
  };
})();
