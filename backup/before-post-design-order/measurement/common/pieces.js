// Measurement. The same screens and the same words as the Measurement Dashboard project
// (Overview, Requests, Areas, Reports; four visit types; Open / Scheduled / To Schedule / Late / Done),
// drawn in this CRM's look and fed from this CRM's own clients instead of Zoho.
//
// Rules kept from that project:
//   Open        = every request that is not done.
//   Scheduled   = a visit date today or later.
//   To Schedule = no visit date, or a visit date that has passed.
//   Late        = a visit date that has passed and the visit is not done.
//   Missing values are never invented. An empty stage stays empty.
// A First Measurement request exists when Sales presses "Request site measurement" on a client.
// EPT Marking, EPT Verification and PDI have no request in this CRM yet, so they show nothing until that is decided.
// This file: the pieces every Measurement page uses (the request list built from the CRM's clients, counts,
// the status pill, a list row, bar charts, grouping). Every other Measurement file reads them from window.MeasurementParts.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const M = window.MeasurementParts = {};
  const STAGES = ['First Measurement', 'EPT Marking', 'EPT Verification', 'PDI'];
  const TONE = { Scheduled: 'blue', 'To Schedule': 'yellow', Late: 'red', Done: 'green' };
  const view = { status: '', sort: 'recent', group: 'city' };
  const short = function (d) { return d ? Kit.day(d).replace(/ \d{4}$/, '') : ''; };

  function requests(all) {
    const today = Kit.today();
    return all.filter(function (c) { return c.measurement && c.stage !== 'bin' && c.stage !== 'lost'; }).map(function (c) {
      const m = c.measurement;
      const status = m.doneAt ? 'Done' : (m.date && m.date >= today ? 'Scheduled' : 'To Schedule');
      return { id: c.id, c: c, m: m, stage: 'First Measurement', status: status, late: !m.doneAt && !!m.date && m.date < today,
        date: m.date || '', assignee: m.assignee || '', city: c.city && c.city !== 'City not set' ? c.city : '', owner: People.owner(c), changed: m.doneAt || m.changedAt || m.requestedAt };
    });
  }
  function count(list) {
    return { Open: list.filter(function (r) { return r.status !== 'Done'; }).length, Scheduled: list.filter(function (r) { return r.status === 'Scheduled'; }).length,
      'To Schedule': list.filter(function (r) { return r.status === 'To Schedule'; }).length, Late: list.filter(function (r) { return r.late; }).length, Done: list.filter(function (r) { return r.status === 'Done'; }).length };
  }
  function pill(r) { return Kit.pill(r.late ? 'Late' : r.status, r.late ? 'red' : TONE[r.status]); }
  function row(r, ctx) {
    return { name: r.c.name, sub: r.stage + ' · ' + (r.city || 'No city') + ' · ' + r.owner + ' · ' + (r.assignee ? 'assigned to ' + r.assignee : 'not assigned') + ' · ' + (r.date ? 'visit ' + short(r.date) : 'no visit date'),
      pill: pill(r), mark: r.late ? 'bad' : '', pick: function () { ctx.show({ id: r.id }); } };
  }
  function bars(title, note, rows, empty) {
    const top = rows.reduce(function (m, x) { return Math.max(m, x[1]); }, 0);
    return Kit.card(title, note, 'blue', rows.length ? rows.map(function (x) {
      return h('div', { class: 'barline' }, h('span', null, x[0]), h('span', null, h('i', { style: 'width: ' + (top ? Math.round(x[1] / top * 100) : 0) + '%' })), h('span', { class: 'num' }, x[1]));
    }) : h('div', { class: 'sub' }, empty));
  }
  function grouped(list, key) {
    const map = {};
    list.forEach(function (r) { const name = r[key] || 'Not provided'; (map[name] = map[name] || []).push(r); });
    return Object.keys(map).map(function (name) { return { name: name, items: map[name] }; }).sort(function (a, b) { return b.items.length - a.items.length || (a.name < b.name ? -1 : 1); });
  }

  Object.assign(M, { STAGES: STAGES, TONE: TONE, view: view, short: short, requests: requests, count: count, pill: pill, row: row, bars: bars, grouped: grouped });
})();
