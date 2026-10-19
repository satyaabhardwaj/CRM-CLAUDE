// Design · common pieces used by every part of the Design dashboard: the shared filters (who is being viewed,
// which dates, the search), the facts strip on top of each window, and the small helpers.
// Every other Design file reads these from window.DesignParts.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts = {};
  // The filters at the top of the Design screen. Only the chosen designer's clients, or everyone's.
  const S = D.state = { designer: '', find: '', range: 'all', kind: '', postKind: '' };
  // Notes and amounts typed into a window but not sent yet.
  D.drafts = {};

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
    return [h('b', { class: 'num' }, Kit.short(L.totals(c).total)), row && row.due ? small(Kit.short(row.due) + ' to collect', true) : small('80% is in')];
  }
  // The designs made so far, with a link to the newest one when a file was uploaded.
  function designs(c) {
    const list = c.design.proposals;
    if (!list.length) return h('span', { class: 'sub' }, 'None yet');
    const p = list[list.length - 1];
    return [h('b', null, 'V' + p.v), h('span', { class: 'sub' }, ' · ' + list.length + ' made · ' + c.design.revisions.length + ' revised'),
      p.designFile ? h('div', null, Kit.fileLink(c.id, p.designFile, 'Open design')) : null];
  }



  // What a post-design client still owes after the booking share: everything up to 100%.
  function owed(c) { return L.ledger(c).reduce(function (t, r) { return t + (r.name === 'Booking' ? 0 : r.due); }, 0); }

  // The open work for Design. Pre-design: a proposal or a revision to make. Post-design: the stage the client is at now.
  function tasks(all) {
    const out = [];
    all.forEach(function (c) {
      if (c.stage === 'design' && c.design.step === 'withDesign') {
        out.push({ c: c, pre: true, kind: 'proposal', at: c.design.stepAt || c.design.sentAt, due: c.design.promisedBy || '', what: isRevision(c) ? 'Revision · V' + (c.design.proposals.length + 1) + ' · ' + lastRevision(c).reason : 'First proposal' });
      } else if (L.handed(c) && !c.factoryAt && L.postStage(c) !== 'Factory') {
        const st = L.postStage(c), KIND = { 'Site measurement': 'measure', EPT: 'ept', Appliances: 'appliances', Design: 'designflow', PDI: 'pdi' };
        const d = L.dates(c);
        out.push({ c: c, pre: false, kind: KIND[st] || 'client', at: c.movedAt || c.bookedAt, due: d ? (st === 'PDI' ? d.pdi : d.signoff) : '',
          what: st === 'Accounts go-ahead' ? 'Accounts go-ahead · ' + Kit.money(L.productionRow(c) ? L.productionRow(c).due : 0) : st + ' · ' + ({ 'Site measurement': 'first site measurement · ' + L.measureState(c).step.toLowerCase(), EPT: L.flowState(c).ept.step, Appliances: 'appliance list to finish', Design: 'design to finalise', PDI: 'last PDI to approve' }[st] || '') });
      }
    });
    return out.sort(function (a, b) { return new Date(a.at || 0) - new Date(b.at || 0); });
  }

  // When the work came to Design: the day the DRF or revision arrived, or the day the client was handed over.
  function cameAt(c) { return L.handed(c) ? (c.movedAt || c.bookedAt || c.receivedAt) : (c.design.stepAt || c.receivedAt); }
  function inRange(c) {
    if (S.range === 'all') return true;
    const day = Kit.ymd(new Date(cameAt(c))), now = new Date();
    let from = Kit.today();
    if (S.range === 'week') { const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); from = Kit.ymd(start); }
    if (S.range === 'month') from = Kit.ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    return day >= from && day <= Kit.today();
  }
  function seen(all) {
    const q = S.find.trim().toLowerCase();
    return all.filter(function (c) {
      return (!S.designer || c.design.designer === S.designer) && inRange(c) && (!q || (c.name + ' ' + c.pid + ' ' + c.city + ' ' + (c.phone || '')).toLowerCase().indexOf(q) >= 0);
    });
  }

  Object.assign(D, { fact: fact, lastRevision: lastRevision, isRevision: isRevision, topFacts: topFacts, STEP: STEP, POST: POST, short: short,
    salesLine: salesLine, money: money, designs: designs, owed: owed, tasks: tasks, cameAt: cameAt, inRange: inRange, seen: seen });
})();
