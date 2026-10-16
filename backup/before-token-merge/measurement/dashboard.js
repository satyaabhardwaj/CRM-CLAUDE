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
(function () {
  const h = Kit.h;
  const L = SalesLogic;
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

  function details(r, ctx) {
    const c = r.c, m = r.m;
    const fact = function (label, value) { return h('div', null, h('span', null, label), h('b', null, value || 'Not provided')); };
    const set = function (key) { return function (v) { ctx.update(function () { m[key] = v; m.changedAt = Kit.now(); }); }; };
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
          Kit.btn(m.doneAt ? 'Reopen' : 'Mark visit done', function () { ctx.update(function () { if (m.doneAt) delete m.doneAt; else m.doneAt = Kit.now(); m.changedAt = Kit.now(); }); }, m.doneAt ? 'line' : 'dark')),
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

  Kit.app({
    id: 'measurement',
    title: 'Measurement',
    tabs: function (all) {
      const list = requests(all);
      return [{ id: 'all', label: 'All four', count: list.filter(function (r) { return r.status !== 'Done'; }).length }].concat(STAGES.map(function (s) {
        return { id: s.toLowerCase().replace(/ /g, '-'), label: s, count: list.filter(function (r) { return r.stage === s && r.status !== 'Done'; }).length };
      }));
    },
    pages: function (tab, all) {
      return [
        { id: 'overview', title: 'Overview', short: 'Home', summary: 'Open, scheduled and to schedule' },
        { id: 'requests', title: 'Requests', short: 'Requests', summary: 'Every request, with search by status' },
        { id: 'areas', title: 'Map and areas', short: 'Areas', summary: 'Requests by city' },
        { id: 'reports', title: 'Reports', short: 'Reports', summary: 'Key numbers, people and cities' }
      ];
    },
    build: function (ctx) {
      const stage = STAGES.filter(function (s) { return s.toLowerCase().replace(/ /g, '-') === ctx.tab; })[0] || '';
      const list = requests(ctx.all).filter(function (r) { return !stage || r.stage === stage; });
      const n = count(list);
      const stat = function (label, value, key, bad) {
        return h('button', { type: 'button', class: 'stat' + (view.status === key && ctx.page === 'requests' ? ' on' : ''), onclick: function () { view.status = key; ctx.go(ctx.tab, 'requests'); } },
          h('span', null, label), h('b', { class: 'num' + (bad && value ? ' bad' : '') }, value));
      };
      const stats = h('div', { class: 'statrow' }, stat('Open', n.Open, 'Open'), stat('Scheduled', n.Scheduled, 'Scheduled'), stat('To schedule', n['To Schedule'], 'To Schedule'), stat('Late', n.Late, 'Late', true), stat('Done', n.Done, 'Done'));
      let main = null;

      if (ctx.page === 'requests') {
        const shown = list.filter(function (r) { return !view.status || (view.status === 'Open' ? r.status !== 'Done' : (view.status === 'Late' ? r.late : r.status === view.status)); })
          .sort(function (a, b) { return view.sort === 'client' ? (a.c.name < b.c.name ? -1 : 1) : (view.sort === 'visit' ? ((a.date || '9999') < (b.date || '9999') ? -1 : 1) : (a.changed < b.changed ? 1 : -1)); });
        main = [stats, h('div', { class: 'onelist' }, Kit.list('Requests',
          h('div', { class: 'flexrow' },
            h('div', { style: 'width: 160px' }, Kit.select(['Open', 'Scheduled', 'To Schedule', 'Late', 'Done'], view.status, function (v) { view.status = v; ctx.update(); }, { placeholder: 'All statuses', label: 'Status' })),
            h('div', { style: 'width: 170px' }, Kit.select([['recent', 'Recently changed'], ['client', 'Client name'], ['visit', 'Visit date']], view.sort, function (v) { view.sort = v; ctx.update(); }, { placeholder: false, label: 'Sort' }))),
          shown.map(function (r) { return row(r, ctx); }), 'No requests match.'))];
      } else if (ctx.page === 'areas') {
        const groups = grouped(list, view.group);
        main = [stats, h('div', { class: 'twolists' },
          Kit.list('Areas', h('div', { style: 'width: 150px' }, Kit.select([['city', 'By city'], ['owner', 'By sales person'], ['assignee', 'By assigned person']], view.group, function (v) { view.group = v; ctx.update(); }, { placeholder: false, label: 'Group by' })),
            groups.map(function (g) { const k = count(g.items); return { name: g.name, sub: k.Open + ' open · ' + k.Scheduled + ' scheduled · ' + k['To Schedule'] + ' to schedule · ' + k.Done + ' done', pill: Kit.pill(g.items.length + ' request(s)', k.Late ? 'red' : 'grey'), pick: function () {} }; }),
            'No requests yet.'),
          Kit.card('Map', '', 'grey', h('div', null, 'The live map is not connected in this CRM yet.'),
            h('div', { class: 'sub' }, 'The Measurement Dashboard project draws it with Mappls and each site\'s exact coordinates. Here the same requests are grouped by city on the left. Nothing is placed on a map from a guess.')))];
      } else if (ctx.page === 'reports') {
        const open = list.filter(function (r) { return r.status !== 'Done'; });
        const soon = open.filter(function (r) { return r.date && r.date >= Kit.today() && r.date <= Kit.addDays(Kit.today(), 7); }).length;
        const key = h('div', { class: 'statrow' },
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'Late'), h('b', { class: 'num' + (n.Late ? ' bad' : '') }, n.Late)),
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'Next 7 days'), h('b', { class: 'num' }, soon)),
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'No date yet'), h('b', { class: 'num' }, open.filter(function (r) { return !r.date; }).length)),
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'Not assigned'), h('b', { class: 'num' }, open.filter(function (r) { return !r.assignee; }).length)),
          h('div', { class: 'stat', style: 'cursor: default' }, h('span', null, 'Done'), h('b', { class: 'num' }, n.Done)));
        const by = function (k) { return grouped(list, k).map(function (g) { return [g.name, g.items.length]; }); };
        main = [key, h('div', { class: 'cols', style: 'overflow-y: auto' },
          bars('By visit type', '', STAGES.map(function (s) { return [s, requests(ctx.all).filter(function (r) { return r.stage === s; }).length]; }), ''),
          bars('By status', '', [['Scheduled', n.Scheduled], ['To schedule', n['To Schedule']], ['Late', n.Late], ['Done', n.Done]], ''),
          bars('Work by assigned person', '', by('assignee'), 'No requests yet.'),
          bars('Work by sales person', '', by('owner'), 'No requests yet.'),
          bars('Top cities', '', by('city'), 'No requests yet.'))];
      } else {
        const upcoming = list.filter(function (r) { return r.status === 'Scheduled'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        const recent = list.slice().sort(function (a, b) { return a.changed < b.changed ? 1 : -1; }).slice(0, 12);
        const every = requests(ctx.all);
        main = [stats,
          n.Late || n['To Schedule'] ? h('div', { class: 'card', style: 'padding: 12px 16px; flex: none' }, h('b', null, (n.Late ? n.Late + ' visit(s) late. ' : '') + (n['To Schedule'] ? n['To Schedule'] + ' request(s) need a visit date.' : ''))) : null,
          h('div', { class: 'twolists', style: 'grid-template-columns: repeat(3, minmax(0, 1fr))' },
            Kit.list('Measurement stages', null, STAGES.map(function (s) {
              const k = count(every.filter(function (r) { return r.stage === s; }));
              return { name: s, sub: k.Open + ' open · ' + k.Scheduled + ' scheduled · ' + k['To Schedule'] + ' to schedule · ' + k.Done + ' done', pill: Kit.pill(k.Open + ' open', k.Late ? 'red' : 'grey'), pick: function () { ctx.go(s.toLowerCase().replace(/ /g, '-'), 'requests'); } };
            }), ''),
            Kit.list('Upcoming visits', null, upcoming.map(function (r) { return row(r, ctx); }), 'No visits are booked.'),
            Kit.list('Recently changed', null, recent.map(function (r) { return row(r, ctx); }), 'No requests yet.'))];
      }

      const r = ctx.open ? requests(ctx.all).filter(function (x) { return x.id === ctx.open.id; })[0] : null;
      return { main: main, window: r ? details(r, ctx) : null };
    }
  });
})();
