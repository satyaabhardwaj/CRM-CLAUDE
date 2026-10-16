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
      sub: c.pid + ' · ' + c.city + ' · ' + c.product + ' · from ' + People.owner(c) + (c.design.designer ? ' · designer ' + c.design.designer : '') + ' · waiting ' + Kit.daysSince(c.design.stepAt) + ' day(s)',
      body: [h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr)' },
        Kit.card('From Sales', '', 'violet',
          rev ? h('div', { class: 'soft' }, h('b', null, 'Change asked' + (rev.by ? ' by ' + rev.by.toLowerCase() : '') + ': ' + rev.reason), rev.notes ? h('div', null, rev.notes) : null, rev.file ? h('div', null, Kit.fileLink(c.id, rev.file)) : null) : null,
          h('div', { class: 'line rule' }, h('span', null, 'Drawings and video files'), Kit.fileLink(c.id, c.docs.drf) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'line rule' }, h('span', null, 'Layout'), Kit.fileLink(c.id, c.docs.layout) || h('span', { class: 'sub' }, 'Not uploaded')),
          h('div', { class: 'facts' },
            fact('Design presentation', b.presentation), fact('Design theme', b.theme),
            fact('Ceiling height (mm)', b.ceilingHeight), fact('Design required on', b.requiredOn ? Kit.day(b.requiredOn) : ''),
            fact('Room / area', b.room), fact('Vastu', b.vastu),
            fact('Kitchen type', b.kitchenType.join(', ')), fact('Kitchen height (mm)', b.kitchenHeight),
            fact('Island', b.island), fact('Gas', b.gas),
            fact('City', c.city), fact('Notes', b.notes),
            fact('Budget', c.budget), fact('Segment', c.segment))),
        Kit.card('Send proposal V' + next, '', 'blue',
          Kit.field('I will send it by', Kit.input(c.design.promisedBy, function (v) { ctx.update(function () { c.design.promisedBy = v; if (v) Kit.news(c, (c.design.designer ? 'Designer ' + c.design.designer : 'The designer') + ' promised the design by ' + Kit.day(v), 'grey'); }); }, { type: 'date' })),
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
              Kit.news(c, 'Proposal V' + next + ' came from Design · ' + Kit.money(d.amount), 'green');
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
        Kit.news(c, 'Design approved the timeline', 'green');
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
        Kit.news(c, 'Design changed the timeline · handover now ' + Kit.day(d.handover), 'yellow');
        delete drafts['t' + c.id];
      });
      ctx.close();
    };
    const changed = dates && ['signoff', 'pdi', 'dispatch', 'handover'].some(function (k) { return d[k] !== dates[k]; });
    const box = function (label, key) { return Kit.field(label, Kit.input(d[key], function (v) { d[key] = v; ctx.update(); }, { type: 'date' })); };
    return {
      title: c.name,
      tag: Kit.pill('Timeline to approve', 'blue'),
      sub: c.pid + ' · ' + c.city + ' · ' + c.product + ' · from ' + People.owner(c),
      body: [h('div', { class: 'cols2', style: 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)' },
        Kit.card('Timeline asked by Sales', '', 'violet',
          dates ? h('div', { class: 'facts' },
            fact('Timeline', c.timeline.type), fact('Production days', String(c.timeline.productionDays)),
            fact('Drawing signoff', Kit.day(dates.signoff)), fact('PDI', Kit.day(dates.pdi)),
            fact('Dispatch', Kit.day(dates.dispatch)), fact('Pooja / handover', Kit.day(dates.handover)))
            : h('div', null, 'No handover date has been entered yet.'),
          dates ? Kit.btn('Approve as it is', approve, 'dark') : null),
        dates ? Kit.card('Or overwrite with your dates', '', 'teal',
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
      body: [h('div', { class: 'cols' },
        Kit.card('Who has this client', '', 'violet', h('div', { class: 'facts' },
          fact('Point of contact', post ? (c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted') : People.owner(c)),
          fact('Sales person', People.owner(c)), fact('Designer', c.design.designer),
          fact('Last spoke to client', last ? Kit.day(last) : ''), fact('Next follow-up', c.nextFollowUp ? Kit.day(c.nextFollowUp) : ''),
          fact('Calls logged', String(c.contacts.length || 0))),
          c.contacts.slice(0, 3).map(function (e) { return h('div', { class: 'hint' }, Kit.dayTime(e.at) + ' · ' + e.type + ' · ' + e.outcome + (e.note ? ' · ' + e.note : '')); })),
        Kit.card('Design', '', 'blue', h('div', { class: 'facts' },
          fact('Proposals', String(c.design.proposals.length || 0)), fact('Revisions', String(c.design.revisions.length || 0)),
          fact('Latest proposal', p ? 'V' + p.v + ' · ' + Kit.money(p.amount) + ' · ' + p.status : ''), fact('Client approved', c.approvedAt ? Kit.day(c.approvedAt) : ''),
          fact('Design theme', b.theme), fact('Kitchen type', b.kitchenType.join(', ')),
          fact('Room / area', b.room), fact('Notes', b.notes)),
          [['Signed quotation', 'quotation'], ['Signed drawing', 'drawing'], ['Drawings and video files', 'drf'], ['Layout', 'layout']].map(function (r) {
            return h('div', { class: 'line rule' }, h('span', null, r[0]), Kit.fileLink(c.id, c.docs[r[1]]) || h('span', { class: 'sub' }, 'Not uploaded'));
          })),
        Kit.card('Dates and money', '', 'green', h('div', { class: 'facts' },
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
  const POST = ['Production drawing', 'PDI', 'Dispatch', 'Handover', 'Handed over'];
  const short = function (d) { return d ? Kit.day(d).replace(/ \d{4}$/, '') : ''; };
  // One line of sales follow-up, shown under every pre-design client.
  function salesLine(c) {
    const last = L.lastSpoke(c);
    return People.owner(c) + ' · ' + (last ? 'spoke ' + short(last) : 'not spoken yet') + (c.nextFollowUp ? ' · next follow-up ' + short(c.nextFollowUp) : '');
  }

  Kit.app({
    id: 'design',
    title: 'Design',
    tabs: function (all) {
      return [
        { id: 'pre', label: 'Pre-design', count: all.filter(function (c) { return (c.stage === 'design' || c.stage === 'token' || c.stage === 'booked') && !L.handed(c); }).length },
        { id: 'post', label: 'Post-design', count: all.filter(L.handed).length }
      ];
    },
    pages: function (tab, all) {
      const inDesign = all.filter(function (c) { return c.stage === 'design'; });
      const step = function (s) { return inDesign.filter(function (c) { return (c.design.step || 'drf') === s; }); };
      if (tab === 'post') {
        const mine = all.filter(L.handed);
        return POST.map(function (name) {
          const n = mine.filter(function (c) { return L.postStage(c) === name; }).length;
          return { id: name.toLowerCase().replace(/ /g, '-'), title: name, short: name.replace('Production drawing', 'Drawing').replace('Handed over', 'Done'), count: n, summary: n + ' client(s) at this stage' };
        }).concat([{ id: 'all', title: 'All post-design clients', short: 'All', count: mine.length, summary: 'Everyone Design now looks after' }]);
      }
      const make = step('withDesign');
      const times = all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && c.approvals.timeline === 'Pending'; });
      const booking = all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && !L.handed(c); });
      return [
        { id: 'make', title: 'Proposals to make', short: 'To make', count: make.length, summary: make.filter(isRevision).length + ' revision(s) · ' + make.filter(function (c) { return c.design.promisedBy && c.design.promisedBy < Kit.today(); }).length + ' late' },
        { id: 'timelines', title: 'Timelines to approve', short: 'Timelines', count: times.length, summary: 'Approve as it is, or overwrite' },
        { id: 'sales', title: 'With Sales', short: 'Sales', count: step('drf').length + step('toShare').length, summary: step('drf').length + ' DRF not sent · ' + step('toShare').length + ' to share with client' },
        { id: 'client', title: 'With client', short: 'Client', count: step('withClient').length, summary: 'Proposal shared, waiting for a yes or changes' },
        { id: 'booking', title: 'Approved · booking amount coming in', short: 'Booking', count: booking.length, summary: 'Moves to post-design when the booking share is in' },
        { id: 'all', title: 'All pre-design clients', short: 'All', count: inDesign.length + booking.length, summary: 'With the sales follow-up on each' }
      ];
    },
    build: function (ctx) {
      const all = ctx.all;
      const inDesign = all.filter(function (c) { return c.stage === 'design'; });
      const step = function (s) { return inDesign.filter(function (c) { return (c.design.step || 'drf') === s; }); };
      const see = function (c) { return function () { ctx.show({ kind: 'client', id: c.id }); }; };
      let main = null;

      if (ctx.tab === 'post') {
        const mine = all.filter(L.handed).filter(function (c) { return ctx.page === 'all' || L.postStage(c).toLowerCase().replace(/ /g, '-') === ctx.page; });
        const title = ctx.page === 'all' ? 'All post-design clients' : (POST.filter(function (n) { return n.toLowerCase().replace(/ /g, '-') === ctx.page; })[0] || 'Post-design');
        main = h('div', { class: 'onelist' }, Kit.list(title, h('span', { class: 'sub' }, 'Design is the point of contact · stage read from the planned dates'),
          mine.map(function (c) {
            const d = L.dates(c), t = L.totals(c);
            return { name: c.name, sub: (c.design.designer ? 'Designer ' + c.design.designer : 'Designer not allotted') + ' · ' + People.owner(c) + ' · ' + c.city +
                (d ? ' · signoff ' + short(d.signoff) + ' · PDI ' + short(d.pdi) + ' · dispatch ' + short(d.dispatch) + ' · handover ' + short(d.handover) : ' · no handover date') +
                (t.total ? ' · paid ' + Math.round(L.collected(c) / t.total * 100) + '%' : ''),
              pill: Kit.pill(L.postStage(c), L.postStage(c) === 'Handed over' ? 'green' : 'blue'), pick: see(c) };
          }), 'No clients at this stage.'));
      } else if (ctx.page === 'timelines') {
        const times = all.filter(function (c) { return (c.stage === 'token' || c.stage === 'booked') && c.approvals.timeline === 'Pending'; });
        main = h('div', { class: 'onelist' }, Kit.list('Timelines to approve', null,
          times.map(function (c) {
            return { name: c.name, sub: salesLine(c) + ' · handover ' + (c.timeline.handover ? Kit.day(c.timeline.handover) : 'not set') + ' · ' + c.timeline.type,
              pill: Kit.pill('Pending', 'blue'), pick: function () { ctx.show({ kind: 'timeline', id: c.id }); } };
          }), 'No timelines are waiting.'));
      } else if (ctx.page === 'make') {
        const asks = step('withDesign').filter(function (c) { return !designer || c.design.designer === designer; })
          .sort(function (a, b) { return new Date(a.design.stepAt || 0) - new Date(b.design.stepAt || 0); });
        const sent = all.filter(function (c) { return c.design.proposals.some(function (p) { return Kit.hoursSince(p.receivedAt) <= 72; }); }).length;
        main = h('div', { class: 'onelist' }, Kit.list('Proposals to make',
          h('div', { class: 'flexrow' }, h('span', { class: 'sub' }, sent + ' sent in 3 days'), h('div', { style: 'width: 160px' }, Kit.select(People.designers, designer, function (v) { designer = v; ctx.update(); }, { placeholder: 'All designers', label: 'Designer' }))),
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
        const sets = { sales: step('drf').concat(step('toShare')), client: step('withClient'), booking: booking, all: inDesign.concat(booking) };
        const titles = { sales: 'With Sales', client: 'With client', booking: 'Approved · booking amount coming in', all: 'All pre-design clients' };
        main = h('div', { class: 'onelist' }, Kit.list(titles[ctx.page] || titles.all, h('span', { class: 'sub' }, 'The sales person is the point of contact'),
          (sets[ctx.page] || sets.all).map(function (c) {
            const p = c.design.proposals[c.design.proposals.length - 1];
            const money = c.stage === 'design' ? (p ? 'V' + p.v + ' · ' + Kit.money(p.amount) : 'No proposal yet')
              : 'collected ' + Kit.money(L.collected(c)) + ' of ' + Kit.money(L.bookingDue(c));
            const tag = c.stage === 'design' ? [STEP[c.design.step || 'drf'], c.design.step === 'withDesign' ? 'blue' : 'grey']
              : [c.stage === 'token' ? 'Token due' : Kit.money(L.bookingLeft(c)) + ' to go', c.stage === 'token' ? 'yellow' : 'blue'];
            return { name: c.name, sub: salesLine(c) + ' · ' + (c.design.designer ? 'designer ' + c.design.designer + ' · ' : '') + money + ' · revised ' + c.design.revisions.length + ' time(s)',
              pill: Kit.pill(tag[0], tag[1]), pick: see(c) };
          }), 'Nobody here right now.'));
      }

      const c = ctx.open ? ctx.all.find(function (x) { return x.id === ctx.open.id; }) : null;
      return { main: main, window: !c ? null : (ctx.open.kind === 'timeline' ? timelineWindow(c, ctx) : (ctx.open.kind === 'proposal' ? proposalWindow(c, ctx) : clientWindow(c, ctx))) };
    }
  });
})();
