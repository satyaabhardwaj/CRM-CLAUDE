(function () {
  const M = MeasurementParts, h = Kit.h;
  M.details = function (r, ctx) {
    const c = r.c, m = r.m;
    const fact = (label, value) => h('div', null, h('span', null, label), h('b', null, value || 'Not provided'));
    const error = h('p', { class: 'm-error', role: 'alert' });
    const set = key => v => {
      if (key === 'date' && v && (!M.day(v) || v < Kit.today())) { error.textContent = 'Choose today or a future visit date.'; return; }
      error.textContent = '';
      ctx.update(() => {
        m[key] = v; m.changedAt = Kit.now();
        m.history = m.history || []; m.history.unshift({ at: m.changedAt, note: key + ' updated: ' + (v || 'cleared') });
        if ((key === 'date' || key === 'assignee') && v && !m.alignedAt) m.alignedAt = Kit.now();
        if (key === 'date' && v) Kit.news(c, r.stage + ' booked for ' + Kit.day(v), 'blue', 'Measurement');
      });
    };
    const work = kind => {
      const problem = kind === 'problems', items = m[kind] || [];
      return Kit.card(problem ? 'Problems' : 'Tasks', items.length, 'grey', Kit.btn(problem ? 'Report a problem' : 'Assign a task', () => M.workDialog(r, ctx, kind)),
        !items.length ? h('p', { class: 'sub' }, problem ? 'No problems reported.' : 'No tasks yet.') : items.map(item => h('div', { class: 'm-work' },
          h('b', null, item.title), h('span', { class: 'sub' }, [item.reason, item.assignee || 'Not assigned', item.due && 'Due ' + Kit.day(item.due)].filter(Boolean).join(' · ')),
          item.note ? h('p', null, item.note) : null,
          Kit.select(problem ? ['Open', 'In Progress', 'Resolved'] : ['To Do', 'In Progress', 'Done'], item.status, v => { M.workStatus(r, item, ctx, v); ctx.update(); }, { placeholder: false, label: 'Status for ' + item.title }),
          h('details', null, h('summary', null, 'History'), (item.history || []).map(e => h('p', { class: 'sub' }, Kit.dayTime(e.at) + ' · ' + e.status + ' · ' + e.note))))));
    };
    return { title: r.client, tag: M.pill(r), sub: [c.pid, c.cid, r.stage, 'Requested ' + Kit.dayTime(m.requestedAt)].filter(Boolean).join(' · '),
      body: [h('div', { class: 'cols' },
        Kit.card('Visit', '', 'grey',
          Kit.field('Visit date', Kit.input(m.date, set('date'), { type: 'date', label: 'Visit date' })),
          Kit.field('Assigned to', Kit.input(m.assignee, set('assignee'), { label: 'Assigned to', placeholder: 'Measurement person' })),
          Kit.field('Note', Kit.input(m.note, set('note'), { label: 'Visit note' })), error,
          m.doneAt ? h('p', { class: 'sub' }, 'Visit done on ' + Kit.day(m.doneAt)) : null,
          Kit.btn(m.doneAt ? 'Reopen' : 'Mark visit done', () => ctx.update(() => {
            const text = m.doneAt ? 'Visit reopened' : 'Visit completed';
            if (m.doneAt) delete m.doneAt; else m.doneAt = Kit.now();
            m.changedAt = Kit.now(); m.history = m.history || []; m.history.unshift({ at: m.changedAt, note: text });
            Kit.news(c, r.stage + ': ' + text, 'green', 'Measurement');
          }), m.doneAt ? 'line' : 'dark')),
        Kit.card('Site', '', 'grey', h('div', { class: 'facts' }, fact('City', r.city), fact('State', r.state), fact('Zone', r.zone), fact('Site address', c.siteAddress), fact('Site contact', c.siteContact), fact('Phone', c.phone), fact('Product', c.product)),
          h('div', { class: 'line rule' }, 'House layout', Kit.fileLink(c.id, (c.docs || {}).layout) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'line rule' }, 'Signed drawing', Kit.fileLink(c.id, (c.docs || {}).drawing) || h('span', { class: 'sub' }, 'Not uploaded')),
          r.coordinates ? Kit.btn('Show on map', () => { M.view.mapRequest = r.id; ctx.go(ctx.tab, 'areas'); }) : h('p', { class: 'sub' }, 'Exact site coordinates are not recorded.')),
        Kit.card('Source', '', 'grey', h('div', { class: 'facts' }, fact('Sales person', r.owner), fact('Designer', (c.design || {}).designer), fact('Requested by', m.by), fact('Client stage', c.stage), fact('Handover planned', (c.timeline || {}).handover ? Kit.day(c.timeline.handover) : '')))),
        h('div', { class: 'cols' }, work('problems'), work('tasks'), Kit.card('Visit history', '', 'grey', (m.history || []).length ? m.history.map(e => h('p', { class: 'sub' }, Kit.dayTime(e.at) + ' · ' + e.note)) : h('p', { class: 'sub' }, 'No visit changes recorded.'))),
        h('p', { class: 'sub' }, 'Problems and tasks belong to this CRM request. Their status does not complete the measurement visit.')]
    };
  };
})();
