// CRM adapter for the ZIP dashboard's shared selectors. Only explicit requests become visits.
(function () {
  const h = Kit.h, source = window.Measurements;
  const M = window.MeasurementParts = {};
  const STAGES = source.STAGES;
  const view = { status: '', sort: 'recent', group: 'city', filters: source.defaults(), expanded: false, area: '', report: 'summary' };
  const stageId = s => s.toLowerCase().replace(/ /g, '-');
  function day(value) {
    if (typeof value !== 'string') return '';
    const d = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d ? d : '';
  }
  function requests(all) {
    if (M.live && M.live.enabled) return M.live.records;
    const today = Kit.today(), out = [];
    all.filter(c => c.stage !== 'bin' && c.stage !== 'lost').forEach(c => {
      STAGES.forEach(stage => {
        const key = stageId(stage);
        const m = stage === STAGES[0] ? c.measurement : (c.measurementVisits || {})[key];
        if (!m || typeof m !== 'object') return;
        const date = day(m.date), requested = day(m.requestedAt);
        const currentBooking = date && (!requested || date >= requested);
        const status = m.doneAt ? 'Done' : currentBooking && date >= today ? 'Scheduled' : 'To Schedule';
        const coordinates = m.coordinates || c.coordinates;
        out.push({ id: c.id + ':' + key, record_id: c.id, c, m, stage, status,
          late: !m.doneAt && !!date && date < today, date, assignee: m.assignee || '',
          client: c.name || 'Unnamed client', order: c.pid || '', city: c.city && c.city !== 'City not set' ? c.city : '',
          state: c.siteState || '', zone: c.zone || '', product: c.product || '', owner: People.owner(c),
          coordinates: Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(Number.isFinite) && Math.abs(coordinates[0]) <= 90 && Math.abs(coordinates[1]) <= 180 && coordinates.some(n => n !== 0) ? coordinates : null,
          changed: m.changedAt || m.doneAt || m.requestedAt || '', modified_at: m.changedAt || m.doneAt || m.requestedAt || '',
          problems: m.problems || [], tasks: m.tasks || [] });
      });
    });
    return out;
  }
  function count(list) {
    return { Open: list.filter(r => r.status !== 'Done').length, Scheduled: list.filter(r => r.status === 'Scheduled').length,
      'To Schedule': list.filter(r => r.status === 'To Schedule').length, Late: list.filter(r => r.late).length, Done: list.filter(r => r.status === 'Done').length };
  }
  function filtered(list, tab) {
    const f = Object.assign({}, view.filters, { stages: tab && tab !== 'all' ? STAGES.filter(s => stageId(s) === tab) : view.filters.stages, status: 'All statuses' });
    return source.filter(list, f).filter(r => !view.filters.withProblems || r.problems.some(p => p.status !== 'Resolved'))
      .filter(r => !view.status || (view.status === 'Open' ? r.status !== 'Done' : view.status === 'Late' ? r.late : r.status === view.status));
  }
  const short = d => d ? Kit.day(d).replace(/ \d{4}$/, '') : '';
  const pill = r => Kit.pill(r.late ? 'Late' : r.status, r.late ? 'red' : { Scheduled: 'blue', 'To Schedule': 'yellow', Done: 'green' }[r.status]);
  const row = (r, ctx) => ({ name: r.client, sub: r.stage + ' · ' + (r.city || 'No city') + ' · ' + (r.assignee || 'Not assigned') + ' · ' + (r.date ? 'visit ' + short(r.date) : 'No visit date'), pill: pill(r), mark: r.late ? 'bad' : '', pick: () => ctx.show({ id: r.id }) });
  function grouped(list, key) { return source.group(list, key); }
  function bars(title, note, rows, empty) {
    const top = Math.max(0, ...rows.map(x => x[1]));
    return Kit.card(title, note, 'grey', rows.length ? rows.map(x => h('div', { class: 'barline' }, h('span', null, x[0]), h('span', null, h('i', { style: 'width:' + (top ? x[1] / top * 100 : 0) + '%' })), h('span', { class: 'num' }, x[1]))) : h('div', { class: 'sub' }, empty));
  }
  Object.assign(M, { STAGES, view, stageId, day, requests, count, filtered, short, pill, row, bars, grouped, source });
})();
