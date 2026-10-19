// Design · My tasks today: every task on the designer's plate, oldest first, in three lists side by side:
// before the booking share (pre-design), after it (post-design), and PDI approvals pending.
// Each row reads: the date it was given, the client, the due date (Manish, 19 Oct 2026).
// Due date: pre-design, the date promised to Sales; post-design, the planned production drawing date (PDI: the PDI date).
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const isRevision = D.isRevision, short = D.short, tasks = D.tasks;

  const GRID = 'grid-template-columns: 62px minmax(0, 1fr) 74px';
  // One list as a small table: Given · Client (what, designer under it) · Due. Late due dates are red.
  function table(title, tools, rows, empty) {
    return h('section', { class: 'card list' },
      h('div', { class: 'list-h' }, h('h1', null, title, h('span', { class: 'count' }, rows.length)), tools || null),
      h('div', { class: 'board-row head', style: GRID + '; margin: 0 12px' }, ['Given', 'Client', 'Due'].map(function (t) { return h('div', null, h('b', null, t)); })),
      h('div', { class: 'rows', 'data-keep': title }, rows.length ? rows.map(function (r) {
        const late = r.due && r.due < Kit.today();
        return h('button', { type: 'button', class: 'board-row', style: GRID + '; width: 100%; cursor: pointer', onclick: r.pick },
          h('span', { class: 'num' }, r.given ? short(r.given) : '-'),
          h('span', { class: 'who' }, h('b', null, r.name), h('small', null, r.sub)),
          h('span', { class: 'num ' + (late ? 'due' : (r.due ? '' : 'notdue')) }, r.due ? short(r.due) : 'No date'));
      }) : h('div', { class: 'empty' }, empty)));
  }

  D.todayMain = function (ctx, all) {
    const mine = function (c) { return !S.designer || c.design.designer === S.designer; };
    const list = tasks(all).filter(function (t) { return mine(t.c); });
    const row = function (t) {
      const c = t.c;
      return { given: t.at, due: t.due, name: c.name, sub: [t.pre ? t.what : t.what.replace(/ · .*$/, ''), c.design.designer || 'No designer'].filter(Boolean).join(' · '),
        pick: function () { ctx.show({ kind: t.kind, id: c.id }); } };
    };
    const POSTKIND = { measure: 'Site measurement', design: 'Design', appliances: 'Appliances', ept: 'EPT', pdi: 'PDI', collect: 'Accounts go-ahead' };
    const pdi = D.pdiWaiting(all).filter(mine).map(function (c) {
      const d = L.dates(c);
      return { given: D.pdiSince(c), due: d ? d.pdi : '', name: c.name, sub: (c.design.designer || 'No designer') + ' · ' + (c.sm || People.owner(c)),
        pick: function () { ctx.show({ kind: 'pdi', id: c.id }); } };
    }).sort(function (a, b) { return (a.given || '') < (b.given || '') ? -1 : 1; });
    return h('div', { class: 'twolists', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
      table('Pre-design tasks',
        h('div', { style: 'width: 150px' }, Kit.select([['first', 'First proposal'], ['revision', 'Revision'], ['late', 'Waiting 3 days or more']], S.kind, function (v) { S.kind = v; ctx.update(); }, { placeholder: 'All tasks', label: 'Type of task' })),
        list.filter(function (t) { return t.pre && (!S.kind || (S.kind === 'late' ? Kit.daysSince(t.at) >= 3 : (S.kind === 'revision') === isRevision(t.c))); }).map(row), 'No proposals or revisions to make.'),
      table('Post-design tasks',
        h('div', { style: 'width: 150px' }, Kit.select([['measure', 'Site measurement'], ['design', 'Design'], ['appliances', 'Appliances'], ['ept', 'EPT'], ['pdi', 'PDI'], ['collect', 'Accounts go-ahead'], ['late', 'Waiting 3 days or more']], S.postKind, function (v) { S.postKind = v; ctx.update(); }, { placeholder: 'All tasks', label: 'Type of task' })),
        list.filter(function (t) { return !t.pre && (!S.postKind || (S.postKind === 'late' ? Kit.daysSince(t.at) >= 3 : L.postStage(t.c) === POSTKIND[S.postKind])); }).map(row), 'No post-design work waiting.'),
      table('PDI approval', null, pdi, 'No PDI pending.'));
  };
})();
