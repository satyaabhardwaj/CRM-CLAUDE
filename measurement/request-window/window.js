// Measurement · the window for one request: book the visit, assign it, mark it done; the site and source details.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const M = window.MeasurementParts;
  const view = M.view, STAGES = M.STAGES, short = M.short;
  const requests = M.requests, count = M.count, pill = M.pill, row = M.row, bars = M.bars, grouped = M.grouped;

  function details(r, ctx) {
    const c = r.c, m = r.m;
    const fact = function (label, value) { return h('div', null, h('span', null, label), h('b', null, value || 'Not provided')); };
    const set = function (key) { return function (v) { ctx.update(function () { m[key] = v; m.changedAt = Kit.now(); if ((key === 'date' || key === 'assignee') && v && !m.alignedAt) m.alignedAt = Kit.now(); if (key === 'date' && v) Kit.news(c, 'Measurement visit booked for ' + Kit.day(v), 'blue', 'Measurement'); }); }; };
    return {
      title: c.name,
      tag: pill(r),
      sub: c.pid + ' · ' + c.cid + ' · ' + r.stage + ' · requested ' + Kit.dayTime(m.requestedAt),
      body: [h('div', { class: 'cols' },
        Kit.card('Visit', '', 'blue',
          Kit.field('Visit date', Kit.input(m.date, set('date'), { type: 'date' })),
          Kit.field('Assigned to', Kit.input(m.assignee, set('assignee'), { placeholder: 'Name of the measurement person' })),
          Kit.field('Note', Kit.input(m.note, set('note'))),
          m.doneAt ? h('div', { class: 'hint' }, 'Visit done on ' + Kit.day(m.doneAt)) : null,
          Kit.btn(m.doneAt ? 'Reopen' : 'Mark visit done', function () { ctx.update(function () { if (m.doneAt) delete m.doneAt; else { m.doneAt = Kit.now(); Kit.news(c, 'Measurement visit done', 'green', 'Measurement'); } m.changedAt = Kit.now(); }); }, m.doneAt ? 'line' : 'dark')),
        Kit.card('Site', '', 'violet', h('div', { class: 'facts' },
          fact('City', r.city), fact('Site type', c.siteType),
          fact('Site address', c.siteAddress), fact('Site contact on the day', c.siteContact),
          fact('Phone', c.phone), fact('Product', c.product)),
          h('div', { class: 'line rule' }, h('span', null, 'House layout'), Kit.fileLink(c.id, c.docs.layout) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'line rule' }, h('span', null, 'Signed drawing'), Kit.fileLink(c.id, c.docs.drawing) || h('span', { class: 'sub' }, 'Not uploaded'))),
        Kit.card('Source', '', 'grey', h('div', { class: 'facts' },
          fact('Sales person', r.owner), fact('Designer', c.design.designer),
          fact('Client stage', { token: 'Token due', booked: 'Booked', post: 'Post-design', design: 'In design', qualified: 'Qualified' }[c.stage] || c.stage), fact('Handover planned', c.timeline.handover ? Kit.day(c.timeline.handover) : ''))))]
    };
  }

  M.details = details;
})();
