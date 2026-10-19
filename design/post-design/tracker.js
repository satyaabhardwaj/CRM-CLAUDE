// Design · Post-design · Order tracker: where each of Design's orders is, like the client tracker in Sales.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, POST = D.POST, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  // Order tracker: where each of Design's orders is, the same idea as the client tracker in Sales.
  // Factory, dispatch and handover are not Design's own stages; this is where the designer looks them up.
  function trackerTable(rows, see) {
    const grid = 'grid-template-columns: minmax(0, 1.7fr) minmax(0, 1.1fr) minmax(0, 0.9fr) repeat(6, minmax(0, 1fr)) minmax(0, 1.1fr)';
    const cell = function (big, small, cls) { return h('span', { class: 'tl-cell' }, h('b', { class: 'num ' + (cls || 'notdue') }, big), small ? h('small', null, small) : null); };
    const TONE = { 'Site measurement': 'red', EPT: 'yellow', Appliances: 'yellow', Design: 'yellow', PDI: 'blue', 'Accounts go-ahead': 'red', Factory: 'green', Dispatch: 'yellow', 'Handed over': 'green' };
    return h('div', { class: 'page', style: 'flex: 1; min-height: 0' },
      h('section', { class: 'card', style: 'flex: 1; min-height: 0; display: flex; flex-direction: column' },
        h('div', { class: 'board-row head', style: grid }, ['Client (' + rows.length + ')', 'Now at', 'Designer', 'Meas · Design · Appl · EPT', '80% payment', 'Factory', 'PDI', 'Dispatch', 'Handover', 'Paid of order'].map(function (t) { return h('div', null, h('b', null, t)); })),
        h('div', { class: 'board-rows', style: 'max-height: none; flex: 1', 'data-keep': 'dtracker' }, rows.length ? rows.map(function (c) {
          const d = L.dates(c), t = L.totals(c), row = L.productionRow(c), stage = L.postStage(c), today = Kit.today();
          const when = function (key) { return !d ? cell('Not set') : cell(short(d[key]), d[key] < today ? 'date passed' : 'planned', d[key] < today ? 'due' : 'notdue'); };
          return h('button', { type: 'button', class: 'board-row', style: grid, onclick: see(c) },
            h('span', { class: 'who' }, h('b', null, c.name), h('small', null, c.pid + ' · ' + People.owner(c))),
            h('span', null, Kit.pill(stage, TONE[stage])),
            h('span', null, c.design.designer || 'Not allotted'),
            (function () { const fs = Object.assign({ measure: L.measureState(c) }, L.flowState(c)), K = ['measure', 'design', 'appliances', 'ept'], n = K.filter(function (k) { return fs[k].state === 'done'; }).length; return cell(n + ' of 4 done', K.map(function (k) { return fs[k].state === 'done' ? 'G' : (fs[k].state === 'progress' ? 'Y' : 'R'); }).join(' · '), n === 4 ? 'paid' : 'due'); })(),
            !row ? cell('Not in plan') : (row.due === 0 ? cell(Kit.lakh(row.amount), 'received', 'paid') : cell(Kit.lakh(row.due), 'to collect', 'due')),
            c.factoryAt ? cell('In', 'since ' + short(c.factoryAt), 'paid') : cell('Not yet', ''),
            L.flow(c).pdi.approvedAt ? cell('Approved', short(L.flow(c).pdi.approvedAt), 'paid') : when('pdi'), when('dispatch'), when('handover'),
            h('span', { class: 'who' }, h('b', { class: 'num' }, Kit.lakh(L.collected(c)) + ' of ' + Kit.lakh(t.total)), h('small', null, t.total ? Math.round(L.collected(c) / t.total * 100) + '% paid' : '')));
        }) : h('div', { class: 'empty' }, 'No post-design orders yet.')),
        h('div', { class: 'board-key' }, h('span', { class: 'paid' }, 'Done'), h('span', { class: 'due' }, 'Needs attention'), h('span', { class: 'notdue' }, 'Planned · amounts in ₹ lakh'))));
  }

  D.trackerTable = trackerTable;
})();
