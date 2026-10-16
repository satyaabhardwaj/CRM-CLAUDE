// Management view. Read only. A short screen: the money, the people, and what is going wrong.
// Click a person or a client to open the full detail.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const S = Signals;
  const root = document.getElementById('app');
  const state = { who: '', open: null, fresh: false, tab: 'overview' };
  const RANK = { red: 0, yellow: 1, blue: 2 };

  function sum(list, fn) { return list.reduce(function (t, x) { return t + fn(x); }, 0); }
  function owner(c) { return c.owner || People.list[0].id; }
  function ago(ms) { const hrs = (Date.now() - ms) / 3600000; return hrs < 1 ? 'just now' : Kit.span(hrs) + ' ago'; }
  function short(iso) { return iso ? Kit.day(iso).replace(/ \d{4}$/, '') : ''; }
  function fact(label, value, bad) { return h('div', null, h('span', null, label), h('b', { class: bad ? 'bad' : '' }, value || 'Not yet')); }
  function tile(label, value, note, tone, bad) { return h('div', { class: 'mg-tile' + (bad ? ' alarm' : '') }, h('span', null, label), h('b', { class: 'num' }, value), h('small', { class: tone || 'grey' }, note || '')); }
  function worst(c) { return S.flags(c).slice().sort(function (a, b) { return RANK[a[1]] - RANK[b[1]]; }); }
  function show(what) { state.open = what; state.fresh = true; render(); }

  // The numbers for one person.
  function stats(p, live) {
    const mine = live.filter(function (c) { return owner(c) === p.id; });
    const cash = mine.filter(function (c) { return c.stage === 'token' || c.stage === 'booked'; });
    const booked = mine.filter(function (c) { return c.stage === 'booked'; });
    const today = Kit.today();
    return {
      mine: mine,
      notCalled: mine.filter(function (c) { return c.stage === 'qualified' && !c.spokeAt; }).length,
      broken: mine.filter(function (c) { return (c.stage === 'qualified' && L.firstCall(c).late) || c.missed24; }).length,
      late: mine.filter(function (c) { return c.nextFollowUp && c.nextFollowUp < today; }).length,
      sitting: mine.filter(function (c) { return c.stage === 'design' && (c.design.step === 'toShare' || (c.design.step || 'drf') === 'drf') && Kit.daysSince(c.design.stepAt) >= 1; }).length,
      calls: sum(mine, function (c) { return c.contacts.length; }),
      revisions: sum(mine, function (c) { return c.design.revisions.length; }),
      bookedCount: booked.length,
      bookedValue: sum(booked, function (c) { return L.totals(c).total; }),
      got: sum(cash, L.collected),
      left: sum(cash, L.bookingLeft),
      problems: mine.filter(function (c) { return S.flags(c).some(function (f) { return f[1] === 'red'; }); }).length,
      touched: mine.length ? Math.max.apply(null, mine.map(S.lastTouch)) : 0
    };
  }

  // ---- the window for one client: money, dates, what is wrong, calls
  function clientWindow(c) {
    const flags = worst(c);
    const p = c.design.proposals[c.design.proposals.length - 1];
    const firstShare = c.design.proposals.filter(function (x) { return x.sharedAt; })[0];
    const token = c.payment.receipts[0];
    const dates = L.dates(c);
    const ball = S.ball(c);
    const today = Kit.today();
    const hasOrder = c.stage === 'token' || c.stage === 'booked';
    return {
      title: c.name,
      tags: flags.length ? flags.slice(0, 2).map(function (f) { return Kit.pill(f[0], f[1]); }) : [Kit.pill('Nothing wrong', 'green')],
      sub: c.pid + ' · ' + People.owner(c) + ' · ' + S.STAGE[c.stage] + ' · ' + c.city + ' · ' + c.product + ' · waiting on ' + ball[0] + ' for ' + ball[1] + ' day(s)',
      body: [h('div', { class: 'cols' },
        Kit.card('Money', '', 'green', h('div', { class: 'facts' },
          fact(hasOrder ? 'Order value' : 'Latest proposal', S.value(c) ? Kit.money(S.value(c)) : ''),
          fact('Payment plan', hasOrder ? c.payment.plan : ''),
          fact('Booking share', hasOrder ? Kit.money(L.bookingDue(c)) : ''),
          fact('Collected', hasOrder ? Kit.money(L.collected(c)) : ''),
          fact('Still to collect', hasOrder ? Kit.money(L.bookingLeft(c)) : '', hasOrder && L.bookingLeft(c) > 0),
          fact('Expected by', short(c.payment.expectedBy), c.payment.expectedBy && c.payment.expectedBy < today && L.bookingLeft(c) > 0),
          fact('Sent to Accounts', c.payment.receipts.length ? c.payment.receipts.length + ' time(s)' : ''),
          fact('Rejected by Accounts', String(c.payment.receipts.filter(function (r) { return r.status === 'Rejected'; }).length || ''), c.payment.receipts.some(function (r) { return r.status === 'Rejected'; })))),
        Kit.card('Dates', '', 'violet', h('div', { class: 'facts' },
          fact('Lead received', short(c.receivedAt)),
          fact('First conversation', short(c.spokeAt), c.missed24 || (c.stage === 'qualified' && L.firstCall(c).late)),
          fact('Sent to designer', short(c.design.sentAt) + (c.design.designer ? ' · ' + c.design.designer : '')),
          fact('Latest proposal', p ? 'V' + p.v + ' · ' + short(p.receivedAt) : ''),
          fact('First shared with client', firstShare ? short(firstShare.sharedAt) : ''),
          fact('Times revised', String(c.design.revisions.length || ''), c.design.revisions.length >= 2),
          fact('Client approved', short(c.approvedAt)),
          fact('Token', token ? short(token.date) + ' · ' + token.status : ''),
          fact('Next follow-up', short(c.nextFollowUp), c.nextFollowUp && c.nextFollowUp < today),
          fact('Handover', dates ? short(dates.handover) + ' ' + dates.handover.slice(0, 4) : ''))),
        Kit.card('What is wrong', '', flags.some(function (f) { return f[1] === 'red'; }) ? 'red' : 'grey',
          flags.length ? flags.map(function (f) { return h('div', { class: 'line rule' }, Kit.pill(f[0], f[1]), h('span', { class: 'sub' }, f[2])); }) : h('div', null, 'Nothing is wrong on this client.'),
          h('b', { style: 'font-size: 12px; color: var(--ink2); margin-top: 6px' }, 'Calls logged · ' + c.contacts.length),
          c.contacts.length ? c.contacts.slice(0, 5).map(function (e) { return h('div', { class: 'hint' }, Kit.dayTime(e.at) + ' · ' + e.type + ' · ' + e.outcome + (e.note ? ' · ' + e.note : '')); }) : h('div', { class: 'hint' }, 'No calls have been logged.')))]
    };
  }

  // ---- the window for one person: every number, their problems, their clients
  function personWindow(p, live) {
    const s = stats(p, live);
    const flagged = s.mine.filter(function (c) { return S.flags(c).length; }).sort(function (a, b) { return RANK[worst(a)[0][1]] - RANK[worst(b)[0][1]]; });
    const item = function (c, pill) {
      return h('button', { type: 'button', class: 'mini', onclick: function () { show({ kind: 'client', id: c.id }); } },
        h('span', { class: 'who' }, h('b', null, c.name), h('small', null, S.STAGE[c.stage] + (S.value(c) ? ' · ' + Kit.short(S.value(c)) : '') + ' · last activity ' + ago(S.lastTouch(c)))), pill);
    };
    return {
      title: p.name,
      tags: [Kit.pill(p.role, 'grey'), s.problems ? Kit.pill(s.problems + ' client(s) with a problem', 'red') : Kit.pill('All clear', 'green')],
      sub: s.mine.length + ' clients · last activity ' + (s.touched ? ago(s.touched) : 'none'),
      body: [h('div', { class: 'cols' },
        Kit.card('Numbers', '', 'grey', h('div', { class: 'facts' },
          fact('Clients', String(s.mine.length)), fact('Calls logged', String(s.calls)),
          fact('Leads not called', String(s.notCalled), s.notCalled > 0), fact('24-hour rule broken', String(s.broken), s.broken > 0),
          fact('Follow-ups late', String(s.late), s.late > 0), fact('Sitting on DRF or proposal', String(s.sitting), s.sitting > 0),
          fact('Revisions sent', String(s.revisions)), fact('Booked', Kit.short(s.bookedValue) + ' (' + s.bookedCount + ')'),
          fact('Collected', Kit.short(s.got)), fact('Still to collect', Kit.short(s.left), s.left > 0))),
        h('section', { class: 'card' }, h('div', { class: 'card-h t-red' }, h('h2', null, 'Problems'), h('span', null, flagged.length)),
          h('div', { class: 'rows', style: 'max-height: 430px' }, flagged.length ? flagged.map(function (c) { const f = worst(c)[0]; return item(c, Kit.pill(f[0], f[1])); }) : h('div', { class: 'empty' }, 'No problems.'))),
        h('section', { class: 'card' }, h('div', { class: 'card-h t-grey' }, h('h2', null, 'All clients'), h('span', null, s.mine.length)),
          h('div', { class: 'rows', style: 'max-height: 430px' }, s.mine.slice().sort(function (a, b) { return S.value(b) - S.value(a); }).map(function (c) { return item(c, Kit.pill(S.STAGE[c.stage], 'grey')); }))))]
    };
  }

  // ---- Sales person wise: everyone side by side, worst first, so slacking shows.
  // The verdict is a plain rule: share of a person's clients that have a red problem.
  function verdict(s) {
    const share = s.mine.length ? s.problems / s.mine.length : 0;
    if (share >= 0.3) return ['Lagging', 'red', share];
    if (share >= 0.1) return ['Watch', 'yellow', share];
    return ['On track', 'green', share];
  }
  function peopleTab(live) {
    const rows = People.list.map(function (p) { const s = stats(p, live); return { p: p, s: s, v: verdict(s), ball: s.mine.filter(function (c) { return S.ball(c)[0] === 'Sales'; }) }; })
      .sort(function (a, b) { return b.v[2] - a.v[2]; });
    const worstOf = function (fn) { const top = Math.max.apply(null, rows.map(fn)); return function (r) { return top > 0 && fn(r) === top; }; };
    const cols = 'grid-template-columns: 1.5fr 1fr 0.7fr 0.8fr 0.8fr 0.9fr 0.9fr 0.9fr 1fr 1fr 1fr 1fr 1fr';
    const defs = [
      ['Clients', function (r) { return r.s.mine.length; }, false],
      ['Not called', function (r) { return r.s.notCalled; }, true],
      ['24h broken', function (r) { return r.s.broken; }, true],
      ['Follow-ups late', function (r) { return r.s.late; }, true],
      ['Sitting on it', function (r) { return r.s.sitting; }, true],
      ['Waiting on them', function (r) { return r.ball.length; }, true],
      ['Calls per client', function (r) { return r.s.mine.length ? Math.round(r.s.calls / r.s.mine.length * 10) / 10 : 0; }, false]
    ];
    return h('div', { class: 'mg' },
      h('div', { class: 'mg-wait' }, h('span', { class: 'sub' }, 'Worst first. Lagging = 30% or more of their clients have a red problem. Watch = 10% or more. The highest number in each problem column is red.')),
      h('section', { class: 'card', style: 'flex: 1' },
        h('div', { class: 'row head', style: cols }, ['Sales person', 'Verdict'].concat(defs.map(function (d) { return d[0]; })).concat(['Booked', 'Collected', 'To collect', 'Last activity']).map(function (t) { return h('div', null, t); })),
        h('div', { class: 'rows' }, rows.map(function (r) {
          return h('button', { type: 'button', class: 'row', style: cols + '; min-height: 58px', onclick: function () { show({ kind: 'person', id: r.p.id }); } },
            h('span', null, h('b', { style: 'font-size: 15px' }, r.p.name), ' ', h('span', { class: 'sub' }, r.p.role)),
            h('span', null, Kit.pill(r.v[0] + ' · ' + Math.round(r.v[2] * 100) + '%', r.v[1])),
            defs.map(function (d) { const isWorst = d[2] && worstOf(d[1])(r); return h('span', { class: 'num ' + (isWorst ? 'bad' : (d[1](r) ? '' : 'ok')) }, d[1](r)); }),
            h('span', { class: 'num' }, Kit.short(r.s.bookedValue) + ' (' + r.s.bookedCount + ')'),
            h('span', { class: 'num' }, Kit.short(r.s.got)),
            h('span', { class: 'num ' + (r.s.left ? 'bad' : 'ok') }, Kit.short(r.s.left)),
            h('span', { class: Kit.daysSince(new Date(r.s.touched || Date.now()).toISOString()) >= 2 ? 'bad' : 'ok' }, r.s.touched ? ago(r.s.touched) : 'No clients'));
        }))));
  }

  // ---- Client wise: every client in one table, worst first.
  const pickStage = { value: '', only: '' };
  function clientsTab(shown) {
    const rows = shown.filter(function (c) { return (!pickStage.value || c.stage === pickStage.value) && (!pickStage.only || S.flags(c).length); })
      .map(function (c) { const f = worst(c); return { c: c, f: f, rank: f.length ? RANK[f[0][1]] : 3 }; })
      .sort(function (a, b) { return (a.rank - b.rank) || (S.lastTouch(a.c) - S.lastTouch(b.c)); });
    const cols = 'grid-template-columns: 1.5fr 1fr 0.9fr 0.9fr 0.8fr 0.9fr 0.9fr 0.6fr 2fr';
    return h('div', { class: 'mg' },
      h('div', { class: 'mg-wait' }, h('span', { class: 'sub' }, rows.length + ' clients · worst first'),
        h('div', { style: 'width: 170px; margin-left: auto' }, Kit.select(S.LIVE.map(function (k) { return [k, S.STAGE[k]]; }), pickStage.value, function (v) { pickStage.value = v; render(); }, { placeholder: 'Every stage', label: 'Stage' })),
        h('div', { style: 'width: 190px' }, Kit.select([['yes', 'Only with a problem']], pickStage.only, function (v) { pickStage.only = v; render(); }, { placeholder: 'All clients', label: 'Problems' }))),
      h('section', { class: 'card', style: 'flex: 1' },
        h('div', { class: 'row head', style: cols }, ['Client', 'Sales person', 'Stage', 'Value', 'In this step', 'Whose move', 'Last activity', 'Calls', 'What is wrong'].map(function (t) { return h('div', null, t); })),
        h('div', { class: 'rows', 'data-keep': 'clients' }, rows.length ? rows.map(function (r) {
          const c = r.c, ball = S.ball(c);
          const idle = Kit.daysSince(new Date(S.lastTouch(c)).toISOString());
          return h('button', { type: 'button', class: 'row' + (r.rank === 0 ? ' redrow' : ''), style: cols, onclick: function () { show({ kind: 'client', id: c.id }); } },
            h('span', null, h('b', null, c.name), ' ', h('span', { class: 'sub' }, c.pid)),
            h('span', null, People.owner(c)), h('span', null, S.STAGE[c.stage]),
            h('span', { class: 'num' }, S.value(c) ? Kit.short(S.value(c)) : ''),
            h('span', { class: 'num ' + (ball[1] >= 3 ? 'bad' : '') }, ball[1] + ' day(s)'),
            h('span', { class: ball[0] === 'Sales' ? '' : 'ok' }, ball[0]),
            h('span', { class: idle >= 3 ? 'bad' : 'ok' }, ago(S.lastTouch(c))),
            h('span', { class: 'num ' + (c.contacts.length ? '' : 'ok') }, c.contacts.length),
            h('span', { class: 'flexrow' }, r.f.length ? [Kit.pill(r.f[0][0], r.f[0][1]), r.f.length > 1 ? h('span', { class: 'sub' }, '+' + (r.f.length - 1)) : null] : h('span', { class: 'ok' }, 'Nothing wrong')));
        }) : h('div', { class: 'empty' }, 'No clients match.'))));
  }

  function render() {
    Kit.fit();
    const keep = {};
    root.querySelectorAll('[data-keep]').forEach(function (el) { keep[el.getAttribute('data-keep')] = el.scrollTop; });

    const everyone = Kit.store.data.clients.filter(function (c) { return c.stage !== 'bin'; });
    everyone.forEach(L.ensure);
    const live = everyone.filter(function (c) { return S.LIVE.indexOf(c.stage) >= 0; });
    const shown = live.filter(function (c) { return !state.who || owner(c) === state.who; });
    const money = shown.filter(function (c) { return c.stage === 'token' || c.stage === 'booked'; });
    const left = sum(money, L.bookingLeft);
    const got = sum(money, L.collected);
    const troubled = shown.filter(function (c) { return S.flags(c).length; }).sort(function (a, b) { return (RANK[worst(a)[0][1]] - RANK[worst(b)[0][1]]) || (S.value(b) - S.value(a)); });
    const redCount = troubled.filter(function (c) { return worst(c)[0][1] === 'red'; }).length;

    const tiles = h('section', { class: 'mg-tiles' },
      tile('Open orders', Kit.short(sum(shown, S.value)) + ' (' + shown.filter(function (c) { return c.stage !== 'qualified'; }).length + ')', shown.length + ' clients'),
      tile('Collected', Kit.short(got), left + got ? Math.round(got / (left + got) * 100) + '% of booking share' : '', 'green'),
      tile('Still to collect', Kit.short(left), money.filter(function (c) { return L.bookingLeft(c) > 0; }).length + ' client(s)', 'red', left > 0),
      tile('Clients with a problem', String(redCount), troubled.length - redCount + ' more to watch', 'red', redCount > 0));

    const waiting = h('div', { class: 'mg-wait' }, h('span', { class: 'sub' }, 'Waiting on'), ['Sales', 'Design', 'Client', 'Accounts'].map(function (name) {
      const list = shown.filter(function (c) { return S.ball(c)[0] === name; });
      const days = list.length ? Math.round(sum(list, function (c) { return S.ball(c)[1]; }) / list.length) : 0;
      return h('span', { class: 'chipline' }, h('b', null, name + ' ' + list.length), list.length ? ' · ' + days + ' day(s) avg' : '');
    }));

    const people = People.list.map(function (p) {
      const s = stats(p, live);
      const chips = [[s.broken, '24h broken'], [s.late, 'follow-ups late'], [s.sitting, 'sitting on it'], [s.notCalled, 'not called']]
        .filter(function (x) { return x[0]; }).map(function (x) { return Kit.pill(x[0] + ' ' + x[1], x[1] === 'not called' ? 'yellow' : 'red'); });
      return h('button', { type: 'button', class: 'person' + (state.who === p.id ? ' on' : ''), onclick: function () { show({ kind: 'person', id: p.id }); } },
        h('div', { class: 'line' }, h('span', null, h('b', null, p.name), ' ', h('span', { class: 'sub' }, p.role + ' · ' + s.mine.length + ' clients')), h('span', { class: 'sub' }, s.touched ? ago(s.touched) : '')),
        h('div', { class: 'line' }, h('span', { class: 'num' }, 'Booked ' + Kit.short(s.bookedValue) + ' (' + s.bookedCount + ') · collected ' + Kit.short(s.got)), h('b', { class: 'num ' + (s.left ? 'bad' : '') }, Kit.short(s.left) + ' to collect')),
        h('div', { class: 'flexrow' }, chips.length ? chips : Kit.pill('All clear', 'green')));
    });
    const teamCard = h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, 'Team'), h('span', null, 'Click to open')), h('div', { class: 'rows', 'data-keep': 'team' }, people));

    const push = Kit.list('Needs a push', null, troubled.map(function (c) {
      const f = worst(c);
      return { name: c.name, sub: People.owner(c) + ' · ' + S.STAGE[c.stage] + (S.value(c) ? ' · ' + Kit.short(S.value(c)) : '') + ' · last activity ' + ago(S.lastTouch(c)) + (f.length > 1 ? ' · ' + (f.length - 1) + ' more' : ''),
        pill: Kit.pill(f[0][0], f[0][1]), mark: f[0][1] === 'red' ? 'bad' : '', pick: function () { show({ kind: 'client', id: c.id }); } };
    }), 'Nothing needs a push right now.');

    // the window
    let win = null;
    if (state.open && state.open.kind === 'client') { const c = everyone.find(function (x) { return x.id === state.open.id; }); if (c) win = clientWindow(c); }
    if (state.open && state.open.kind === 'person') { const p = People.list.find(function (x) { return x.id === state.open.id; }); if (p) win = personWindow(p, live); }
    const close = function () { state.open = null; render(); };
    const windowEls = win ? [
      h('div', { class: 'veil', onclick: close }),
      h('div', { class: 'sheet' + (state.fresh ? ' rise' : ''), role: 'dialog', 'aria-label': win.title },
        h('div', { class: 'sheet-h' }, h('div', null, h('div', { class: 'flexrow' }, h('h2', null, win.title), win.tags), h('div', { class: 'sub', style: 'font-size: 13px; margin-top: 4px' }, win.sub)), Kit.btn('Close', close, 'small')),
        h('div', { class: 'sheet-b', 'data-keep': 'sheet' }, win.body))] : [];
    state.fresh = false;

    const pick = h('div', { style: 'width: 220px' }, Kit.select(People.list.map(function (p) { return [p.id, p.role + ' · ' + p.name]; }), state.who, function (v) { state.who = v; render(); }, { placeholder: 'Whole team', label: 'Person' }));
    Kit.keepFocus(root, function () {
    root.replaceChildren(
      h('header', { class: 'top dark' },
        h('div', { class: 'flexrow' }, h('div', { class: 'brand' }, 'MAGPPIE ', h('span', null, 'Management')), Kit.depts('management'), h('span', { class: 'note' }, 'Read only')),
        h('div', { class: 'flexrow' },
          h('div', { class: 'tabs' }, [['overview', 'Overview'], ['people', 'Sales person wise'], ['clients', 'Client wise'], ['analysis', 'Full analysis']].map(function (t) { return h('button', { type: 'button', class: state.tab === t[0] ? 'on' : '', onclick: function () { state.tab = t[0]; state.open = null; render(); } }, t[1]); })),
          pick)),
      h('div', { class: 'body', style: 'padding: 0' },
        state.tab === 'analysis' ? Analysis.render(everyone.filter(function (c) { return !state.who || owner(c) === state.who; }), render)
          : state.tab === 'people' ? peopleTab(live)
          : state.tab === 'clients' ? clientsTab(shown)
          : h('div', { class: 'mg' }, tiles, waiting, h('div', { class: 'mg-two' }, teamCard, push)),
        windowEls));
    });
    root.querySelectorAll('[data-keep]').forEach(function (el) { const top = keep[el.getAttribute('data-keep')]; if (top) el.scrollTop = top; });
  }

  window.addEventListener('resize', Kit.fit);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) { state.open = null; render(); } });
  Kit.store.load().then(function () { render(); Kit.store.watch(render); setInterval(function () { if (!state.open && !Kit.busy()) render(); }, 60000); });
})();
