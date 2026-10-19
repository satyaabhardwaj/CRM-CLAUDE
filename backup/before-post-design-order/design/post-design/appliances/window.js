// Design · Post-design · Appliances window: build the client's appliance list, send it, count how often the client
// sends it back, and mark it signed (with the signed copy). Signed = green.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const drafts = {};
  D.appliancesWindow = function (c, ctx) {
    const f = L.flow(c), s = L.flowState(c), a = f.appliances;
    const d = drafts[c.id] = drafts[c.id] || { name: '', make: '', note: '', back: '' };
    const add = function () {
      if (!d.name.trim()) { d.msg = 'Write the appliance first.'; return ctx.update(); }
      ctx.update(function () { a.items.push({ name: d.name.trim(), make: d.make.trim(), note: d.note.trim(), at: Kit.now() }); a.signedAt = ''; d.name = d.make = d.note = ''; d.msg = ''; });
    };
    return {
      title: c.name,
      tag: Kit.pill('Appliances · ' + D.flowColor[s.appliances.state][2], s.appliances.state === 'done' ? 'green' : (s.appliances.state === 'progress' ? 'yellow' : 'red')),
      sub: c.pid + ' · ' + (c.design.designer ? 'Designer ' + c.design.designer : 'No designer') + ' · EPT ' + D.flowColor[s.ept.state][2].toLowerCase(),
      body: [D.topFacts(c), h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr)' },
        Kit.card('Appliance list · ' + a.items.length + ' item(s)', a.signedAt ? 'signed ' + Kit.day(a.signedAt) : '', 'blue',
          a.items.length ? a.items.map(function (x, i) {
            return h('div', { class: 'line rule' }, h('span', null, h('b', null, x.name), x.make ? h('span', { class: 'sub' }, ' · ' + x.make) : null, x.note ? h('span', { class: 'sub' }, ' · ' + x.note) : null),
              Kit.btn('Remove', function () { ctx.update(function () { a.items.splice(i, 1); a.signedAt = ''; }); }, 'small line'));
          }) : h('div', { class: 'sub' }, 'No appliances on the list yet.'),
          h('div', { class: 'g3' },
            Kit.field('Appliance', Kit.input(d.name, function (v) { d.name = v; }, { placeholder: 'For example: Hob' })),
            Kit.field('Brand / model', Kit.input(d.make, function (v) { d.make = v; })),
            Kit.field('Note', Kit.input(d.note, function (v) { d.note = v; }))),
          Kit.warn(d),
          Kit.btn('Add appliance', add, 'line')),
        Kit.card('With the client', '', 'violet',
          h('div', { class: 'facts' },
            h('div', null, h('span', null, 'Sent to client'), h('b', null, s.appliances.sent + ' time(s)')),
            h('div', null, h('span', null, 'Sent back by client'), h('b', null, s.appliances.returned + ' time(s)')),
            h('div', null, h('span', null, 'Signed by client'), h('b', null, a.signedAt ? Kit.day(a.signedAt) : 'Not yet'))),
          h('div', { class: 'flexrow' },
            Kit.btn('List sent to client', function () { if (!a.items.length) { d.msg = 'Add the appliances first.'; return ctx.update(); } ctx.update(function () { L.flowLog(a, 'List sent to client'); }); }, 'line')),
          Kit.field('If the client sent it back: what they want changed', Kit.input(d.back, function (v) { d.back = v; })),
          Kit.btn('Client sent the list back', function () { ctx.update(function () { L.flowLog(a, 'Client sent the list back', d.back); a.signedAt = ''; Kit.news(c, 'Client sent the appliance list back' + (d.back ? ': ' + d.back : ''), 'yellow', 'Design'); d.back = ''; }); }, 'line'),
          a.signedAt ? Kit.pill('Signed ' + Kit.day(a.signedAt), 'green')
            : Kit.btn('Client signed the appliance list', function () { if (!a.items.length) { d.msg = 'Add the appliances first.'; return ctx.update(); } ctx.update(function () { a.signedAt = Kit.now(); L.flowLog(a, 'Client signed the list'); Kit.news(c, 'Client signed the appliance list', 'green', 'Design'); }); }, 'dark'),
          h('div', { class: 'line rule' }, h('span', null, 'Signed appliance list', a.file ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, a.file)) : null),
            Kit.upload('Upload', a.file, function (file) { Kit.store.sendFile(c.id, file).then(function (name) { ctx.update(function () { a.file = name; }); }); })),
          a.log.length ? a.log.slice().reverse().slice(0, 6).map(function (x) { return h('div', { class: 'hint' }, Kit.dayTime(x.at) + ' · ' + x.what + (x.note ? ' · ' + x.note : '')); }) : null))]
    };
  };
})();
