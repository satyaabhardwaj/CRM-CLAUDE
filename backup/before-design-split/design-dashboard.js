// Design. Two portals, chosen from the slim tabs on top, each with its own strip of pages on the left.
//   Pre-design:  until the booking share (50% on the SM plan) is in. The sales person is the point of contact.
//                Design makes proposals for Sales and approves timelines.
//   Post-design: from the booking share onwards. Design is the point of contact. Production drawing, PDI,
//                dispatch and handover. The stage is read from the planned dates until the real stages are given.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const drafts = {};
  let designer = '';

  function fact(label, value) { return h('div', null, h('span', null, label), h('b', null, value || 'Not given')); }
  function lastRevision(c) { return c.design.revisions[c.design.revisions.length - 1]; }
  function isRevision(c) { return c.design.proposals.length > 0 && !!lastRevision(c); }

  // The important facts about a client, in one strip at the top of every Design window:
  // who the sales person is, when the client was last spoken to, what was asked for, and the money.
  function topFacts(c) {
    const b = c.design.brief, last = L.lastSpoke(c), p = c.design.proposals[c.design.proposals.length - 1], t = L.totals(c);
    const post = L.handed(c);
    const items = [
      ['Sales person', People.owner(c)],
      ['Designer', c.design.designer || 'Not allotted'],
      ['Client phone', c.phone || 'Not given'],
      ['Last contacted', last ? Kit.dayTime(last) : 'Not spoken yet'],
      ['Next follow-up', c.nextFollowUp ? Kit.when(c.nextFollowUp) : 'None set'],
      ['Came to Design', cameAt(c) ? Kit.dayTime(cameAt(c)) : 'Not recorded'],
      post ? ['Order value', Kit.money(t.total)] : ['Budget', c.budget || 'Not given'],
      post ? ['Received', Kit.money(L.collected(c)) + ' · ' + (t.total ? Math.round(L.collected(c) / t.total * 100) : 0) + '%'] : ['Latest proposal', p ? 'V' + p.v + ' · ' + Kit.money(p.amount) : 'None yet'],
      ['Area', b.sqft ? Kit.commas(Kit.num(b.sqft)) + ' sq ft' : 'Not given'],
      post ? ['Handover', c.timeline.handover ? Kit.day(c.timeline.handover) : 'Not set'] : ['Design needed by', b.requiredOn ? Kit.day(b.requiredOn) : 'Not given'],
      ['Segment', c.segment || 'Not set'],
      ['Priority', c.priority || 'Not set']
    ];
    return h('section', { class: 'card topfacts' }, items.map(function (x) { return h('div', null, h('span', null, x[0]), h('b', null, x[1])); }));
  }

  // A request for a proposal.
  function proposalWindow(c, ctx) {
    const d = drafts[c.id] = drafts[c.id] || { amount: 0, estimate: '', design: '', note: '' };
    const b = c.design.brief;
    const rev = isRevision(c) ? lastRevision(c) : null;
    const next = c.design.proposals.length + 1;
    const pick = function (key) { return function (file) { Kit.store.sendFile(c.id, file).then(function (name) { d[key] = name; ctx.update(); }); }; };
    return {
      title: c.name,
      tag: Kit.pill(rev ? 'Revision · V' + next : 'First proposal', rev ? 'yellow' : 'blue'),
      sub: c.pid + ' · ' + c.cid + ' · ' + c.city + ' · ' + c.product + ' · waiting ' + Kit.daysSince(c.design.stepAt) + ' day(s)',
      body: [topFacts(c), h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr)' },
        Kit.card('From Sales', '', 'violet',
          rev ? h('div', { class: 'soft' }, h('b', null, 'Change asked' + (rev.by ? ' by ' + rev.by.toLowerCase() : '') + ': ' + rev.reason), rev.notes ? h('div', null, rev.notes) : null, rev.file ? h('div', null, Kit.fileLink(c.id, rev.file)) : null) : null,
          h('div', { class: 'line rule' }, h('span', null, 'Drawings and video files'), Kit.fileLink(c.id, c.docs.drf) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'line rule' }, h('span', null, 'Layout'), Kit.fileLink(c.id, c.docs.layout) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'facts' },
            fact('Design presentation', b.presentation), fact('Design theme', b.theme),
            fact('Ceiling height (mm)', b.ceilingHeight), fact('Design required on', b.requiredOn ? Kit.day(b.requiredOn) : ''),
            fact('Room / area', b.room), fact('Area (sq ft)', b.sqft), fact('Vastu', b.vastu),
            fact('Kitchen type', b.kitchenType.join(', ')), fact('Kitchen height (mm)', b.kitchenHeight),
            fact('Island', b.island), fact('Gas', b.gas),
            fact('City', c.city), fact('Notes', b.notes),
            fact('Budget', c.budget), fact('Segment', c.segment))),
        Kit.card('Send proposal V' + next, '', 'blue',
          Kit.field('I will send it by', Kit.input(c.design.promisedBy, function (v) { ctx.update(function () { c.design.promisedBy = v; if (v) Kit.news(c, (c.design.designer ? 'Designer ' + c.design.designer : 'The designer') + ' promised the design by ' + Kit.day(v), 'grey', 'Design'); }); }, { type: 'date' })),
          Kit.field('Estimate total (₹), including GST', Kit.input(d.amount, function (v) { d.amount = v; }, { money: true })),
          h('div', { class: 'line rule' }, h('span', null, 'Estimate', d.estimate ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, d.estimate)) : null), Kit.upload('Upload', d.estimate, pick('estimate'))),
          h('div', { class: 'line rule' }, h('span', null, 'Design / floor plan', d.design ? h('span', { class: 'sub' }, ' · ', Kit.fileLink(c.id, d.design)) : null), Kit.upload('Upload', d.design, pick('design'))),
          Kit.field('Note for Sales', Kit.input(d.note, function (v) { d.note = v; })),
          Kit.warn(d),
          Kit.btn('Send to ' + People.owner(c), function () {
            if (!d.amount) { d.msg = 'Enter the estimate total.'; return ctx.update(); }
            ctx.update(function () {
              c.design.proposals.push({ v: next, amount: d.amount, file: d.estimate, designFile: d.design, note: d.note, receivedAt: Kit.now(), status: 'To share' });
              c.design.step = 'toShare';
              c.design.stepAt = Kit.now();
              c.design.newProposal = true;
              c.design.promisedBy = '';
              Kit.news(c, 'Proposal V' + next + ' came from Design · ' + Kit.money(d.amount), 'green', 'Design');
              delete drafts[c.id];
            });
            ctx.close();
          }, 'dark')))]
    };
  }

  // A timeline waiting for Design's yes or no.
  function timelineWindow(c, ctx) {
    const dates = L.dates(c);
    const d = drafts['t' + c.id] = drafts['t' + c.id] || Object.assign({}, dates || {});
    const approve = function () {
      ctx.update(function () {
        c.approvals.timeline = 'Approved';
        Kit.news(c, 'Design approved the timeline', 'green', 'Design');
        delete drafts['t' + c.id];
      });
      ctx.close();
    };
    // Design does not reject a timeline. It writes its own dates over it, and both versions are kept.
    const overwrite = function () {
      ctx.update(function () {
        c.timelineChanges = c.timelineChanges || [];
        c.timelineChanges.push({ at: Kit.now(), by: 'Design', before: Object.assign({}, dates), after: { signoff: d.signoff, pdi: d.pdi, dispatch: d.dispatch, handover: d.handover } });
        c.timeline.type = 'Custom';
        c.timeline.handover = d.handover;
        c.timeline.custom = { signoff: d.signoff, pdi: d.pdi, dispatch: d.dispatch };
        c.approvals.timeline = 'Overwritten';
        Kit.news(c, 'Design changed the timeline · handover now ' + Kit.day(d.handover), 'yellow', 'Design');
        delete drafts['t' + c.id];
      });
      ctx.close();
    };
    const changed = dates && ['signoff', 'pdi', 'dispatch', 'handover'].some(function (k) { return d[k] !== dates[k]; });
    const box = function (label, key) { return Kit.field(label, Kit.input(d[key], function (v) { d[key] = v; ctx.update(); }, { type: 'date' })); };
    return {
      title: c.name,
      tag: Kit.pill('Timeline', 'blue'),
      sub: c.pid + ' · ' + c.city + ' · ' + c.product + ' · from ' + People.owner(c),
      body: [topFacts(c), h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)' },
        Kit.card('Timeline from Sales', '', 'violet',
          dates ? h('div', { class: 'facts' },
            fact('Timeline', c.timeline.type), fact('Production days', String(c.timeline.productionDays)),
            fact('Drawing signoff', Kit.day(dates.signoff)), fact('PDI', Kit.day(dates.pdi)),
            fact('Dispatch', Kit.day(dates.dispatch)), fact('Pooja / handover', Kit.day(dates.handover)))
            : h('div', null, 'No handover date has been entered yet.'),
          null),
        dates ? Kit.card('Overwrite with your dates', '', 'teal',
          h('div', { class: 'g2' }, box('Drawing signoff', 'signoff'), box('PDI', 'pdi'), box('Dispatch', 'dispatch'), box('Pooja / handover', 'handover')),
          Kit.btn('Overwrite timeline', overwrite, 'line', { disabled: !changed })) : null)]
    };
  }

  // Everything about one client on one screen, for the designer who now owns them.
  function clientWindow(c, ctx) {
    const b = c.design.brief, d = L.dates(c), t = L.totals(c);
    const last = L.lastSpoke(c);
    const p = c.design.proposals[c.design.proposals.length - 1];
    const post = L.handed(c);
    return {
      title: c.name,
      tag: Kit.pill(post ? L.postStage(c) : (STEP[c.design.step] || c.stage), 'blue'),
      sub: c.pid + ' · ' + c.cid + ' · ' + c.city + ' · ' + c.product + (c.phone ? ' · ' + c.phone : ''),
      body: [(function () {
        const steps = [['Proposal', c.design.proposals.length > 0 || !!c.approvedAt], ['Client approved', !!c.approvedAt], ['Booking share in', post], ['Drawing signed off', !!c.drawingSignedAt], ['30% in', post && !!c.drawingSignedAt && !(L.productionRow(c) && L.productionRow(c).due > 0)], ['Factory', !!c.factoryAt]];
        const at = steps.findIndex(function (x) { return !x[1]; });
        return h('div', { class: 'steps', style: 'flex: none' }, steps.map(function (x, i) { return h('span', { class: x[1] ? 'done' : (i === at ? 'now' : '') }, x[0]); }));
      })(),
      topFacts(c),
      h('div', { class: 'cols' },
        Kit.card('Who has this client', '', 'violet', h('div', { class: 'facts' },
          fact('Point of contact', post ? (c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted') : People.owner(c)),
          fact('Sales person', People.owner(c)), fact('Designer', c.design.designer),
          fact('Last spoke to client', last ? Kit.day(last) : ''), fact('Next follow-up', c.nextFollowUp ? Kit.when(c.nextFollowUp) : ''),
          fact('Calls logged', String(c.contacts.length || 0))),
          c.contacts.slice(0, 3).map(function (e) { return h('div', { class: 'hint' }, Kit.dayTime(e.at) + ' · ' + e.type + ' · ' + Kit.outcome(e.outcome) + (e.note ? ' · ' + e.note : '')); })),
        Kit.card('Design', '', 'blue', h('div', { class: 'facts' },
          fact('Proposals', String(c.design.proposals.length || 0)), fact('Revisions', String(c.design.revisions.length || 0)),
          fact('Latest proposal', p ? 'V' + p.v + ' · ' + Kit.money(p.amount) + ' · ' + p.status : ''), fact('Client approved', c.approvedAt ? Kit.day(c.approvedAt) : ''),
          fact('Design theme', b.theme), fact('Kitchen type', b.kitchenType.join(', ')),
          fact('Room / area', b.room), fact('Notes', b.notes)),
          [['Signed quotation', 'quotation'], ['Signed drawing', 'drawing'], ['Drawings and video files', 'drf'], ['Layout', 'layout']].map(function (r) {
            return h('div', { class: 'line rule' }, h('span', null, r[0]), Kit.fileLink(c.id, c.docs[r[1]]) || h('span', { class: 'sub' }, 'Not uploaded'));
          })),
        Kit.card('Dates and money', '', 'green',
          !post ? null : (function () {
            const row = L.productionRow(c);
            return h('div', { class: 'soft' },
              h('b', { style: 'font-size: 12px; color: var(--ink2)' }, 'Post-design steps'),
              h('div', { class: 'line' }, h('span', null, '1 · Final production drawing'),
                c.drawingSignedAt ? Kit.pill('Signed off ' + short(c.drawingSignedAt), 'green')
                  : Kit.btn('Final drawing signed off', function () { ctx.update(function () { c.drawingSignedAt = Kit.now(); Kit.news(c, 'Final production drawing signed off', 'green', 'Design'); L.toFactory(c); }); }, 'small dark')),
              h('div', { class: 'line' }, h('span', null, '2 · Collect 30%' + (row ? ' · ' + Kit.money(row.amount) : '')),
                !row ? Kit.pill('Not in this plan', 'grey') : (row.due === 0 ? Kit.pill('Received', 'green') : Kit.pill(Kit.money(row.due) + ' to collect', 'red'))),
              h('div', { class: 'line' }, h('span', null, '3 · Factory'),
                c.factoryAt ? Kit.pill('In factory since ' + short(c.factoryAt), 'green') : Kit.pill('After 1 and 2', 'grey')),
              c.factoryMail ? h('div', { class: 'sub' }, c.factoryMail.state === 'sent' ? 'Factory emailed: ' + (c.factoryMail.to || []).join(', ') + (c.factoryMail.test ? ' (test mode)' : '') : (c.factoryMail.state === 'sending' ? 'Emailing the factory…' : 'Factory email not sent. ' + (c.factoryMail.why || ''))) : null,
              h('div', { class: 'sub' }, 'Accounts records the 30% when it arrives. The order moves to the Factory by itself once both are done.'));
          })(),
          h('div', { class: 'facts' },
          fact('Drawing signoff', d ? Kit.day(d.signoff) : ''), fact('PDI', d ? Kit.day(d.pdi) : ''),
          fact('Dispatch', d ? Kit.day(d.dispatch) : ''), fact('Handover', d ? Kit.day(d.handover) : ''),
          fact('Order value', t.total ? Kit.money(t.total) : ''), fact('Paid so far', t.total ? Kit.money(L.collected(c)) + ' · ' + Math.round(L.collected(c) / t.total * 100) + '%' : '')),
          L.ledger(c).map(function (s) {
            return h('div', { class: 'line rule' }, h('span', null, h('b', null, s.name), h('span', { class: 'sub' }, ' · ' + s.percent + '% · ' + Kit.money(s.amount))),
              Kit.pill(s.due === 0 && s.amount ? 'Paid' : (s.paid ? Kit.money(s.due) + ' left' : 'Not paid'), s.due === 0 && s.amount ? 'green' : 'grey'));
          })))]
    };
  }

  const STEP = { drf: 'DRF not sent yet', withDesign: 'With Design', toShare: 'Sales to share with client', withClient: 'With client' };
  const POST = L.POST;
  const short = function (d) { return d ? Kit.day(d).replace(/ \d{4}$/, '') : ''; };
  // One line of sales follow-up, shown under every pre-design client.
  function salesLine(c) {
    const last = L.lastSpoke(c);
    return People.owner(c) + ' · ' + (last ? 'spoke ' + short(last) : 'not spoken yet') + (c.nextFollowUp ? ' · next follow-up ' + short(c.nextFollowUp) : '');
  }

  // The money on a task: the proposal value before booking; the order value and what Design has to collect after.
  function money(c, pre) {
    const p = c.design.proposals[c.design.proposals.length - 1];
    const small = function (text, bad) { return h('div', { class: bad ? 'bad' : 'sub', style: 'font-size: 12px' }, text); };
    if (pre) return p ? [h('b', { class: 'num' }, Kit.short(p.amount)), small('proposal')] : [h('span', null, c.budget || 'No value yet'), small('budget')];
    const row = L.productionRow(c);
    return [h('b', { class: 'num' }, Kit.short(L.totals(c).total)), row && row.due ? small(Kit.short(row.due) + ' to collect', true) : small('30% is in')];
  }
  // The designs made so far, with a link to the newest one when a file was uploaded.
  function designs(c) {
    const list = c.design.proposals;
    if (!list.length) return h('span', { class: 'sub' }, 'None yet');
    const p = list[list.length - 1];
    return [h('b', null, 'V' + p.v), h('span', { class: 'sub' }, ' · ' + list.length + ' made · ' + c.design.revisions.length + ' revised'),
      p.designFile ? h('div', null, Kit.fileLink(c.id, p.designFile, 'Open design')) : null];
  }
  // The strip on top of every Design screen: the day at a glance. Each tile opens the list behind it.
  function strip(all, ctx) {
    const pre = all.filter(function (c) { return (c.stage === 'design' || c.stage === 'booked') && !L.handed(c); });
    const post = all.filter(L.handed);
    const todo = tasks(all);
    const make = all.filter(function (c) { return c.stage === 'design' && c.design.step === 'withDesign'; });
    const late = todo.filter(function (t) { return Kit.daysSince(t.at) >= 3; });
    const collect = post.filter(function (c) { return L.postStage(c) === 'Collect 30%'; });
    const factory = post.filter(function (c) { return L.postStage(c) === 'Factory'; });
    const sum = function (list, fn) { return list.reduce(function (t, c) { return t + fn(c); }, 0); };
    const last = function (c) { const p = c.design.proposals[c.design.proposals.length - 1]; return c.stage === 'design' ? (p ? Number(p.amount) || 0 : 0) : L.totals(c).total; };
    const tile = function (label, big, note, tone, tab, page, pct) {
      return h('button', { type: 'button', class: 'eye' + (ctx.tab === tab && (!page || ctx.page === page) ? ' on' : ''), onclick: function () { ctx.go(tab, page || ''); } },
        h('span', null, label), h('b', { class: 'num' }, big),
        pct == null ? null : h('span', { class: 'meter ' + (tone || 'blue') }, h('i', { style: 'width: ' + Math.max(4, Math.min(100, pct)) + '%' })),
        note ? h('small', { class: tone || '' }, note) : null);
    };
    const share = function (part, whole) { return whole ? Math.round(part / whole * 100) : 0; };
    const onTime = todo.length ? share(todo.length - late.length, todo.length) : 100;
    const signed = post.filter(function (c) { return !!c.drawingSignedAt; }).length;
    const due30 = sum(post, function (c) { return L.productionRow(c) ? L.productionRow(c).amount : 0; });
    const got30 = sum(post, function (c) { return L.productionRow(c) ? L.productionRow(c).paid : 0; });
    return h('section', { class: 'eyes', style: 'grid-template-columns: repeat(5, minmax(0, 1fr))', 'aria-label': 'Design at a glance' },
      tile('My tasks today', '(' + todo.length + ')', onTime + '% inside 3 days', onTime === 100 ? 'green' : (onTime >= 50 ? 'amber' : 'red'), 'today', '', onTime),
      tile('Proposals to make', '(' + make.length + ')', make.filter(isRevision).length + ' revision(s)', 'blue', 'pre', 'make', share(make.length, pre.length)),
      tile('Drawing to sign off', '(' + (post.length - signed) + ')', share(signed, post.length) + '% signed off', signed === post.length ? 'green' : 'amber', 'post', 'production-drawing', share(signed, post.length)),
      tile('30% collected', Kit.short(got30) + ' of ' + Kit.short(due30), share(got30, due30) + '% collected', share(got30, due30) >= 50 ? 'green' : (got30 ? 'amber' : 'red'), 'post', 'collections', share(got30, due30)),
      tile('In factory', Kit.short(sum(factory, function (c) { return L.totals(c).total; })) + ' (' + factory.length + ')', share(factory.length, post.length) + '% of post-design', 'green', 'post', 'tracker', share(factory.length, post.length)));
  }

  // Order tracker: where each of Design's orders is, the same idea as the client tracker in Sales.
  // Factory, dispatch and handover are not Design's own stages; this is where the designer looks them up.
  function trackerTable(rows, see) {
    const grid = 'grid-template-columns: minmax(0, 1.7fr) minmax(0, 1.1fr) minmax(0, 0.9fr) repeat(6, minmax(0, 1fr)) minmax(0, 1.1fr)';
    const cell = function (big, small, cls) { return h('span', { class: 'tl-cell' }, h('b', { class: 'num ' + (cls || 'notdue') }, big), small ? h('small', null, small) : null); };
    const TONE = { 'Production drawing': 'blue', 'Collect 30%': 'red', Factory: 'yellow', Dispatch: 'yellow', 'Handed over': 'green' };
    return h('div', { class: 'page', style: 'flex: 1; min-height: 0' },
      h('section', { class: 'card', style: 'flex: 1; min-height: 0; display: flex; flex-direction: column' },
        h('div', { class: 'board-row head', style: grid }, ['Client (' + rows.length + ')', 'Now at', 'Designer', 'Drawing signoff', '30% payment', 'Factory', 'PDI', 'Dispatch', 'Handover', 'Paid of order'].map(function (t) { return h('div', null, h('b', null, t)); })),
        h('div', { class: 'board-rows', style: 'max-height: none; flex: 1', 'data-keep': 'dtracker' }, rows.length ? rows.map(function (c) {
          const d = L.dates(c), t = L.totals(c), row = L.productionRow(c), stage = L.postStage(c), today = Kit.today();
          const when = function (key) { return !d ? cell('Not set') : cell(short(d[key]), d[key] < today ? 'date passed' : 'planned', d[key] < today ? 'due' : 'notdue'); };
          return h('button', { type: 'button', class: 'board-row', style: grid, onclick: see(c) },
            h('span', { class: 'who' }, h('b', null, c.name), h('small', null, c.pid + ' · ' + People.owner(c))),
            h('span', null, Kit.pill(stage, TONE[stage])),
            h('span', null, c.design.designer || 'Not allotted'),
            c.drawingSignedAt ? cell('Signed', short(c.drawingSignedAt), 'paid') : cell('Pending', d ? 'planned ' + short(d.signoff) : '', 'due'),
            !row ? cell('Not in plan') : (row.due === 0 ? cell(Kit.lakh(row.amount), 'received', 'paid') : cell(Kit.lakh(row.due), 'to collect', 'due')),
            c.factoryAt ? cell('In', 'since ' + short(c.factoryAt), 'paid') : cell('Not yet', ''),
            when('pdi'), when('dispatch'), when('handover'),
            h('span', { class: 'who' }, h('b', { class: 'num' }, Kit.lakh(L.collected(c)) + ' of ' + Kit.lakh(t.total)), h('small', null, t.total ? Math.round(L.collected(c) / t.total * 100) + '% paid' : '')));
        }) : h('div', { class: 'empty' }, 'No post-design orders yet.')),
        h('div', { class: 'board-key' }, h('span', { class: 'paid' }, 'Done'), h('span', { class: 'due' }, 'Needs attention'), h('span', { class: 'notdue' }, 'Planned · amounts in ₹ lakh'))));
  }

  // What a post-design client still owes after the booking share: the production 30%, the PDI 20% and any later share.
  function owed(c) { return L.ledger(c).reduce(function (t, r) { return t + (r.name === 'Booking' ? 0 : r.due); }, 0); }

  // The open work for Design. Pre-design: a proposal or a revision to make. Post-design: the stage the client is at now.
  function tasks(all) {
    const out = [];
    all.forEach(function (c) {
      if (c.stage === 'design' && c.design.step === 'withDesign') {
        out.push({ c: c, pre: true, kind: 'proposal', at: c.design.stepAt || c.design.sentAt, what: isRevision(c) ? 'Revision · V' + (c.design.proposals.length + 1) + ' · ' + lastRevision(c).reason : 'First proposal' });
      } else if (L.handed(c) && (L.postStage(c) === 'Production drawing' || L.postStage(c) === 'Collect 30%')) {
        out.push({ c: c, pre: false, kind: 'client', at: c.drawingSignedAt || c.movedAt || c.bookedAt, what: L.postStage(c) === 'Collect 30%' ? 'Collect 30% · ' + Kit.money(L.productionRow(c) ? L.productionRow(c).due : 0) : 'Final production drawing' });
      }
    });
    return out.sort(function (a, b) { return new Date(a.at || 0) - new Date(b.at || 0); });
  }

  // Only the chosen designer's clients, or everyone's.
  let find = '', range = 'all', kind = '', postKind = '';
  // When the work came to Design: the day the DRF or revision arrived, or the day the client was handed over.
  function cameAt(c) { return L.handed(c) ? (c.movedAt || c.bookedAt || c.receivedAt) : (c.design.stepAt || c.receivedAt); }
  function inRange(c) {
    if (range === 'all') return true;
    const day = Kit.ymd(new Date(cameAt(c))), now = new Date();
    let from = Kit.today();
    if (range === 'week') { const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); from = Kit.ymd(start); }
    if (range === 'month') from = Kit.ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    return day >= from && day <= Kit.today();
  }
  function seen(all) {
    const q = find.trim().toLowerCase();
    return all.filter(function (c) {
      return (!designer || c.design.designer === designer) && inRange(c) && (!q || (c.name + ' ' + c.pid + ' ' + c.city + ' ' + (c.phone || '')).toLowerCase().indexOf(q) >= 0);
    });
  }

  Kit.app({
    id: 'design',
    title: 'Design',
    hears: ['Sales', 'Accounts', 'Measurement'],
    tools: function (ctx) {
      const options = [['', 'Everyone · head ' + People.designHead]].concat(People.designers.map(function (d) { return [d, 'Designer · ' + d]; }));
      const search = h('input', { type: 'search', placeholder: 'Find a client', 'aria-label': 'Find a client', style: 'width: 170px' });
      search.value = find;
      search.addEventListener('input', function () { find = search.value; ctx.update(); });
      return [
        h('div', { style: 'width: 220px' }, Kit.select(options, designer, function (v) { designer = v; ctx.update(); }, { placeholder: false, label: 'Viewing' })),
        h('div', { style: 'width: 140px' }, Kit.select([['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']], range, function (v) { range = v; ctx.update(); }, { placeholder: false, label: 'Dates' })),
        search];
    },
    tabs: function (all) {
      all = seen(all);
      return [
        { id: 'today', label: 'My tasks today', count: tasks(all).length },
        { id: 'pre', label: 'Pre-design', count: all.filter(function (c) { return (c.stage === 'design' || c.stage === 'token' || c.stage === 'booked') && !L.handed(c); }).length },
        { id: 'post', label: 'Post-design', count: all.filter(L.handed).length }
      ];
    },
    pages: function (tab, all) {
      if (tab === 'today') return [];
      all = seen(all);
      const inDesign = all.filter(function (c) { return c.stage === 'design'; });
      const step = function (s) { return inDesign.filter(function (c) { return (c.design.step || 'drf') === s; }); };
      if (tab === 'post') {
        const mine = all.filter(L.handed);
        const at = function (name) { return mine.filter(function (c) { return L.postStage(c) === name; }).length; };
        return [
          { id: 'production-drawing', title: 'Production drawing', short: 'Drawing', count: at('Production drawing'), summary: 'Final drawing to be signed off' },
          { id: 'collect-30%', title: 'Collect 30%', short: '30%', count: at('Collect 30%'), summary: 'Drawing signed off, payment still to come' },
          { id: 'collections', title: 'Collections', short: 'Collect', count: mine.filter(function (c) { return owed(c) > 0; }).length,
            summary: Kit.short(mine.reduce(function (t, c) { return t + owed(c); }, 0)) + ' still to collect after booking' },
          { id: 'tracker', title: 'Order tracker', short: 'Tracker', count: mine.length, summary: at('Factory') + ' in factory · ' + at('Dispatch') + ' dispatched · ' + at('Handed over') + ' handed over' }
        ];
      }
      const make = step('withDesign');
      const times = all.filter(function (c) { return c.stage === 'booked' && !L.handed(c) && !!c.timeline.handover; });
      const booking = all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && !L.handed(c); });
      return [
        { id: 'make', title: 'Proposals to make', short: 'To make', count: make.length, summary: make.filter(isRevision).length + ' revision(s) · ' + make.filter(function (c) { return c.design.promisedBy && c.design.promisedBy < Kit.today(); }).length + ' late' },
        { id: 'timelines', title: 'Timelines', short: 'Timelines', count: times.length, summary: 'Overwrite a date if it cannot be met' },
        { id: 'sales', title: 'With Sales', short: 'Sales', count: step('drf').length + step('toShare').length, summary: step('drf').length + ' DRF not sent · ' + step('toShare').length + ' to share with client' },
        { id: 'booking', title: 'Approved · booking amount coming in', short: 'Booking', count: booking.length, summary: 'Moves to post-design when the booking share is in' },
        { id: 'all', title: 'All pre-design clients', short: 'All', count: inDesign.length + booking.length, summary: 'With the sales follow-up on each' }
      ];
    },
    build: function (ctx) {
      const all = seen(ctx.all);
      const inDesign = all.filter(function (c) { return c.stage === 'design'; });
      const step = function (s) { return inDesign.filter(function (c) { return (c.design.step || 'drf') === s; }); };
      const see = function (c) { return function () { ctx.show({ kind: 'client', id: c.id }); }; };
      let main = null;

      if (ctx.tab === 'today') {
        // Everything a designer has on their plate right now, oldest first: who, what, since when, how big, and which side of the 50%.
        const list = tasks(all).filter(function (t) { return !designer || t.c.design.designer === designer; });
        // Two lists side by side, like Sales: what is to be done before the booking share, and what after.
        const item = function (t) {
          const c = t.c, days = Kit.daysSince(t.at), p = c.design.proposals[c.design.proposals.length - 1], row = L.productionRow(c);
          const area = c.design.brief.sqft ? Kit.commas(Kit.num(c.design.brief.sqft)) + ' sq ft' : '';
          const amount = t.pre ? (p ? Kit.short(p.amount) : (c.budget ? 'budget ' + c.budget : '')) : Kit.short(L.totals(c).total) + (row && row.due ? ' · ' + Kit.short(row.due) + ' to collect' : '');
          return { name: c.name, priority: c.priority, sub: [t.pre ? t.what : t.what.replace(/ · .*$/, ''), c.design.designer || 'No designer', area, amount].filter(Boolean).join(' · '),
            pill: Kit.pill(days === 0 ? 'Today' : days + (days === 1 ? ' day' : ' days'), days >= 3 ? 'red' : (days >= 1 ? 'yellow' : 'green')), mark: days >= 3 ? 'bad' : (days === 0 ? 'new' : ''), pick: function () { ctx.show({ kind: t.kind, id: c.id }); } };
        };
        main = h('div', { class: 'twolists' },
          Kit.list('Pre-design tasks',
            h('div', { style: 'width: 170px' }, Kit.select([['first', 'First proposal'], ['revision', 'Revision'], ['late', 'Waiting 3 days or more']], kind, function (v) { kind = v; ctx.update(); }, { placeholder: 'All tasks', label: 'Type of task' })),
            list.filter(function (t) { return t.pre && (!kind || (kind === 'late' ? Kit.daysSince(t.at) >= 3 : (kind === 'revision') === isRevision(t.c))); }).map(item), 'No proposals or revisions to make.'),
          Kit.list('Post-design tasks',
            h('div', { style: 'width: 170px' }, Kit.select([['drawing', 'Drawing to sign off'], ['collect', 'Collect 30%'], ['late', 'Waiting 3 days or more']], postKind, function (v) { postKind = v; ctx.update(); }, { placeholder: 'All tasks', label: 'Type of task' })),
            list.filter(function (t) { return !t.pre && (!postKind || (postKind === 'late' ? Kit.daysSince(t.at) >= 3 : (postKind === 'collect') === (L.postStage(t.c) === 'Collect 30%'))); }).map(item), 'No drawings to sign off and no 30% to collect.'));
      } else if (ctx.tab === 'post' && ctx.page === 'tracker') {
        main = trackerTable(all.filter(L.handed), see);
      } else if (ctx.tab === 'post' && ctx.page === 'collections') {
        // Collections: the money Design has to bring in after booking, client by client, biggest first.
        const rows = all.filter(L.handed).filter(function (c) { return owed(c) > 0; }).sort(function (a, b) { return owed(b) - owed(a); });
        const next = function (c) { return L.ledger(c).filter(function (r) { return r.name !== 'Booking' && r.due > 0; })[0]; };
        main = h('div', { class: 'onelist' }, Kit.list('Collections', h('span', { class: 'sub' }, Kit.short(rows.reduce(function (t, c) { return t + owed(c); }, 0)) + ' to collect from ' + rows.length + ' client(s)'),
          rows.map(function (c) {
            const t = L.totals(c), n = next(c);
            return { name: c.name + ' · ' + Kit.short(owed(c)),
              sub: (c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted') + ' · order ' + Kit.short(t.total) + ' · received ' + Kit.short(L.collected(c)) + ' (' + Math.round(L.collected(c) / t.total * 100) + '%) · ' +
                L.ledger(c).filter(function (r) { return r.name !== 'Booking'; }).map(function (r) { return r.name + ' ' + r.percent + '%: ' + (r.due ? Kit.short(r.due) + ' due' : 'paid'); }).join(' · '),
              pill: Kit.pill(n ? 'Next: ' + n.name + ' ' + Kit.short(n.due) : 'All in', 'red'), pick: see(c) };
          }), 'Nothing left to collect from post-design clients.'));
      } else if (ctx.tab === 'post') {
        const mine = all.filter(L.handed).filter(function (c) { return ctx.page === 'all' || L.postStage(c).toLowerCase().replace(/ /g, '-') === ctx.page; });
        const title = ctx.page === 'all' ? 'All post-design clients' : (POST.filter(function (n) { return n.toLowerCase().replace(/ /g, '-') === ctx.page; })[0] || 'Post-design');
        main = h('div', { class: 'onelist' }, Kit.list(title, h('span', { class: 'sub' }, 'Design is the point of contact · collect the 30% after the final drawing signoff, then it goes to the Factory'),
          mine.map(function (c) {
            const d = L.dates(c), t = L.totals(c);
            return { name: c.name, sub: (c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted') + ' · ' + People.owner(c) + ' · ' + c.city +
                (d ? ' · signoff ' + short(d.signoff) + ' · PDI ' + short(d.pdi) + ' · dispatch ' + short(d.dispatch) + ' · handover ' + short(d.handover) : ' · no handover date') +
                (t.total ? ' · paid ' + Math.round(L.collected(c) / t.total * 100) + '%' : '') +
                (L.productionRow(c) && L.productionRow(c).due > 0 ? ' · 30% to collect ' + Kit.short(L.productionRow(c).due) : ''),
              pill: Kit.pill(L.postStage(c), L.postStage(c) === 'Collect 30%' ? 'red' : (L.postStage(c) === 'Factory' || L.postStage(c) === 'Handed over' ? 'green' : 'blue')), pick: see(c) };
          }), 'No clients at this stage.'));
      } else if (ctx.page === 'timelines') {
        const times = all.filter(function (c) { return c.stage === 'booked' && !L.handed(c) && !!c.timeline.handover; });
        main = h('div', { class: 'onelist' }, Kit.list('Timelines · overwrite a date if it cannot be met', null,
          times.map(function (c) {
            return { name: c.name, sub: salesLine(c) + ' · handover ' + (c.timeline.handover ? Kit.day(c.timeline.handover) : 'not set') + ' · ' + c.timeline.type,
              pill: Kit.pill(c.approvals.timeline === 'Overwritten' ? 'Overwritten' : 'From Sales', c.approvals.timeline === 'Overwritten' ? 'yellow' : 'grey'), pick: function () { ctx.show({ kind: 'timeline', id: c.id }); } };
          }), 'No timelines yet.'));
      } else if (ctx.page === 'make') {
        const asks = step('withDesign').filter(function (c) { return !designer || c.design.designer === designer; })
          .sort(function (a, b) { return new Date(a.design.stepAt || 0) - new Date(b.design.stepAt || 0); });
        const sent = all.filter(function (c) { return c.design.proposals.some(function (p) { return Kit.hoursSince(p.receivedAt) <= 72; }); }).length;
        main = h('div', { class: 'onelist' }, Kit.list('Proposals to make',
          h('div', { class: 'flexrow' }, h('span', { class: 'sub' }, sent + ' sent in 3 days')),
          asks.map(function (c) {
            const rev = isRevision(c);
            const days = Kit.daysSince(c.design.stepAt);
            const late = c.design.promisedBy && c.design.promisedBy < Kit.today();
            return { name: c.name, sub: (c.design.designer ? 'Designer ' + c.design.designer : 'No designer allotted') + ' · ' + salesLine(c) + ' · ' + c.city + (rev ? ' · ' + lastRevision(c).reason : ''),
              pill: Kit.pill(late ? 'Promised ' + short(c.design.promisedBy) + ' · late' : (c.design.promisedBy ? 'Promised ' + short(c.design.promisedBy) : (rev ? 'Revision' : 'First proposal') + ' · ' + days + ' day(s)'), late || days >= 3 ? 'red' : (rev ? 'yellow' : 'blue')),
              pick: function () { ctx.show({ kind: 'proposal', id: c.id }); } };
          }), 'No requests from Sales right now.'));
      } else {
        const booking = all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && !L.handed(c); });
        const sets = { sales: step('drf').concat(step('toShare')), booking: booking, all: inDesign.concat(booking) };
        const titles = { sales: 'With Sales', booking: 'Approved · booking amount coming in', all: 'All pre-design clients' };
        main = h('div', { class: 'onelist' }, Kit.list(titles[ctx.page] || titles.all, h('span', { class: 'sub' }, 'The sales person is the point of contact'),
          (sets[ctx.page] || sets.all).map(function (c) {
            const p = c.design.proposals[c.design.proposals.length - 1];
            const money = c.stage === 'design' ? (p ? 'V' + p.v + ' · ' + Kit.short(p.amount) : 'No proposal yet')
              : 'collected ' + Kit.short(L.collected(c)) + ' of ' + Kit.short(L.bookingDue(c));
            const tag = c.stage === 'design' ? [STEP[c.design.step || 'drf'], c.design.step === 'withDesign' ? 'blue' : 'grey']
              : [!L.tokenIn(c) ? 'Token not in' : Kit.short(L.bookingLeft(c)) + ' to go', !L.tokenIn(c) ? 'red' : 'blue'];
            return { name: c.name, sub: salesLine(c) + ' · ' + (c.design.designer ? 'designer ' + c.design.designer + ' · ' : '') + money + ' · revised ' + c.design.revisions.length + ' time(s)',
              pill: Kit.pill(tag[0], tag[1]), pick: see(c) };
          }), 'Nobody here right now.'));
      }

      main = [strip(all, ctx), main];
      const box = function (title, tone, items, empty) {
        return h('section', { class: 'card' }, h('div', { class: 'card-h t-' + tone }, h('h2', null, title), h('span', null, items.length || '')),
          items.length ? items.slice(0, 3).map(function (x) {
            return h('button', { type: 'button', class: 'item', onclick: function () { ctx.show({ kind: x.kind, id: x.c.id }); } },
              h('span', { class: 'line' }, h('b', null, x.c.name), x.pill), h('span', { class: 'sub' }, x.sub));
          }) : h('div', { class: 'item', style: 'cursor: default' }, h('span', { class: 'sub' }, empty)));
      };
      const todo = tasks(all);
      const waiting = todo.filter(function (t) { return Kit.daysSince(t.at) >= 3; }).map(function (t) { return { c: t.c, kind: t.kind, pill: Kit.pill(Kit.daysSince(t.at) + ' days', 'red'), sub: t.what.replace(/ · .*$/, '') + ' · ' + (t.c.design.designer || 'No designer') }; });
      const promised = all.filter(function (c) { return c.stage === 'design' && c.design.step === 'withDesign' && c.design.promisedBy; }).sort(function (a, b) { return a.design.promisedBy < b.design.promisedBy ? -1 : 1; })
        .map(function (c) { const late = c.design.promisedBy < Kit.today(); return { c: c, kind: 'proposal', pill: Kit.pill(short(c.design.promisedBy), late ? 'red' : 'grey'), sub: (late ? 'Promise date passed' : 'Promised to Sales') + ' · ' + (c.design.designer || 'No designer') }; });
      const money = all.filter(L.handed).filter(function (c) { return owed(c) > 0; }).sort(function (a, b) { return owed(b) - owed(a); })
        .map(function (c) { return { c: c, kind: 'client', pill: Kit.pill(Kit.short(owed(c)), 'red'), sub: 'received ' + Math.round(L.collected(c) / L.totals(c).total * 100) + '% · ' + L.postStage(c) }; });
      const fresh = all.filter(function (c) { return (c.news || []).some(function (n) { return Kit.newsFrom(n) !== 'Design' && Kit.hoursSince(n.at) <= 48; }); })
        .map(function (c) { const n = c.news.filter(function (x) { return Kit.newsFrom(x) !== 'Design'; })[0]; return { c: c, kind: L.handed(c) ? 'client' : (c.design.step === 'withDesign' ? 'proposal' : 'client'), pill: Kit.pill(Kit.newsFrom(n), 'blue'), sub: n.text }; });
      const rail = [box('Waiting 3 days or more', 'amber', waiting, 'Nothing is waiting long.'), box('Promised to Sales', 'violet', promised, 'No promise dates given.'),
        box('Money to collect', 'green', money, 'Nothing to collect.'), box('Just in', 'blue', fresh, 'Nothing new from Sales or Accounts.')];
      const c = ctx.open ? ctx.all.find(function (x) { return x.id === ctx.open.id; }) : null;
      return { main: main, rail: rail, window: !c ? null : (ctx.open.kind === 'timeline' ? timelineWindow(c, ctx) : (ctx.open.kind === 'proposal' ? proposalWindow(c, ctx) : clientWindow(c, ctx))) };
    }
  });
})();
