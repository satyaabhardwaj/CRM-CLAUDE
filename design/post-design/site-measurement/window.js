// Design · Post-design · First site measurement window (step 1 since 19 Oct 2026).
// Sent: Design (or Sales) sends the request to Measurement. Aligned: the measurement person sets a visit date or a name.
// Done: the visit is done. Aligned and Done are set on the Measurement screen; this window shows them, with a small note.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  D.measureSmall = function (m) {
    // One line each, under the button: when it was sent, aligned and done.
    return ['Sent ' + (m.sentAt ? D.short(m.sentAt) : '-'), 'Aligned ' + (m.alignedAt ? D.short(m.alignedAt) : '-'), 'Done ' + (m.doneAt && m.doneAt !== 'recorded' ? D.short(m.doneAt) : (m.doneAt ? '(recorded)' : '-'))];
  };
  D.measureWindow = function (c, ctx) {
    const m = L.measureState(c);
    const step = function (n, label, at, extra) {
      return h('div', { class: 'line rule' }, h('span', null, h('b', null, n + ' · ' + label), extra ? h('span', { class: 'sub' }, ' · ' + extra) : null),
        at ? Kit.pill(at === 'recorded' ? 'Recorded' : Kit.day(at), 'green') : Kit.pill('Not yet', 'grey'));
    };
    return {
      title: c.name,
      tag: Kit.pill('First site measurement · ' + m.step, m.state === 'done' ? 'green' : (m.state === 'progress' ? 'yellow' : 'red')),
      sub: c.pid + ' · ' + (c.design.designer ? 'Designer ' + c.design.designer : 'No designer') + ' · ' + c.city,
      body: [D.topFacts(c), h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)' },
        Kit.card('First site measurement', '', 'violet',
          step(1, 'Sent', m.sentAt, c.measurement && c.measurement.by ? 'by ' + c.measurement.by : ''),
          step(2, 'Aligned', m.alignedAt, [m.visit ? 'visit ' + Kit.day(m.visit) : '', m.who].filter(Boolean).join(' · ')),
          step(3, 'Done', m.doneAt),
          c.measurement ? null : Kit.btn('Send to Measurement', function () { ctx.update(function () { L.sendMeasurement(c, 'Design'); }); }, 'dark'),
          h('div', { class: 'hint' }, 'Aligned and Done are filled in by the measurement person on the Measurement screen.')),
        Kit.card('Notes', '', 'blue',
          c.measurement ? Kit.field('Note for the measurement (both teams see it)', Kit.input(m.note, function (v) { ctx.update(function () { c.measurement.note = v; c.measurement.changedAt = Kit.now(); }); }, { placeholder: 'For example: client available after 4 pm' }))
            : h('div', { class: 'sub' }, 'Send the request first; then a note can be added.')))]
    };
  };
})();
