// Design · Post-design · EPT window (Electrical, Plumbing, Tiling, Ducting, Gas drawings).
// Pick where the EPT now is from the options; every choice is kept, so the rounds can be counted.
// "Client signed the EPT" makes it green; the signed copy can be uploaded.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const drafts = {};
  D.eptWindow = function (c, ctx) {
    const f = L.flow(c), s = L.flowState(c), e = f.ept;
    const d = drafts[c.id] = drafts[c.id] || { step: '', note: '' };
    const record = function () {
      if (!d.step) { d.msg = 'Choose where the EPT is now.'; return ctx.update(); }
      ctx.update(function () {
        L.flowLog(e, d.step, d.note); e.step = d.step;
        if (d.step === 'Client signed the EPT') { e.signedAt = Kit.now(); Kit.news(c, 'Client signed the EPT', 'green', 'Design'); }
        else if (d.step === 'Client asked for changes') { e.signedAt = ''; Kit.news(c, 'Client asked for EPT changes' + (d.note ? ': ' + d.note : ''), 'yellow', 'Design'); }
        delete drafts[c.id];
      });
    };
    return {
      title: c.name,
      tag: Kit.pill('EPT · ' + D.flowColor[s.ept.state][2], s.ept.state === 'done' ? 'green' : (s.ept.state === 'progress' ? 'yellow' : 'red')),
      sub: c.pid + ' · ' + (c.design.designer ? 'Designer ' + c.design.designer : 'No designer') + ' · sales manager ' + (c.sm || People.owner(c)),
      body: [D.topFacts(c), h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)' },
        Kit.card('Where the EPT is now', '', 'blue',
          h('div', { class: 'facts' },
            h('div', null, h('span', null, 'Now'), h('b', null, s.ept.step)),
            h('div', null, h('span', null, 'Sent to client'), h('b', null, s.ept.sent + ' time(s)')),
            h('div', null, h('span', null, 'Returned with changes'), h('b', null, s.ept.returned + ' time(s)')),
            h('div', null, h('span', null, 'Signed by client'), h('b', null, e.signedAt ? Kit.day(e.signedAt) : 'Not yet'))),
          Kit.field('Move the EPT to', Kit.select(L.EPT_STEPS, d.step, function (v) { d.step = v; ctx.update(); }, { placeholder: 'Choose' })),
          Kit.field('Note (optional)', Kit.input(d.note, function (v) { d.note = v; }, { placeholder: d.step === 'Client asked for changes' ? 'What the client wants changed' : '' })),
          Kit.warn(d),
          Kit.btn('Record', record, 'dark'),
          h('div', { class: 'line rule' }, h('span', null, 'Signed EPT', e.file ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, e.file)) : null),
            Kit.upload('Upload', e.file, function (file) { Kit.store.sendFile(c.id, file).then(function (name) { ctx.update(function () { e.file = name; }); }); }))),
        Kit.card('History', e.log.length + ' entr' + (e.log.length === 1 ? 'y' : 'ies'), 'grey',
          e.log.length ? e.log.slice().reverse().map(function (x) { return h('div', { class: 'line rule' }, h('span', null, h('b', null, x.what), x.note ? h('span', { class: 'sub' }, ' · ' + x.note) : null), h('span', { class: 'sub' }, Kit.dayTime(x.at))); })
            : h('div', { class: 'sub' }, L.siteMeasured(c) ? 'Site measured. Nothing recorded on the EPT yet.' : 'Waiting for the first site measurement.')))]
    };
  };
})();
