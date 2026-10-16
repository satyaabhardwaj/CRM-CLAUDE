// The clean two-line list every dashboard uses, and the Follow-up calls list that sits beside it.
(function () {
  const h = Kit.h;
  const STAGE = { qualified: 'Qualified', design: 'In design', token: 'Token due', booked: 'Booked' };
  const ABOUT = { qualified: 'First conversation', design: 'Proposal follow-up', token: 'Collect token', booked: 'Collect booking amount' };
  const TYPES = [['overdue', 'Overdue'], ['today', 'Due today'], ['later', 'Coming up'], ['Collect token', 'Collect token'], ['Collect booking amount', 'Collect booking amount'], ['Proposal follow-up', 'Proposal follow-up'], ['First conversation', 'First conversation'], ['RNR', 'RNR, call again']];
  const picked = {};

  const mini = Kit.list;

  // What the next call is about, and when it is due.
  function followUp(c) {
    if (c.retry) {
      const left = (new Date(c.retry.dueAt).getTime() - Date.now()) / 3600000;
      return { why: 'RNR', when: left >= 0 ? 'today' : 'overdue', pill: Kit.pill('Try ' + (c.retry.tries + 1) + ' · ' + Kit.span(left) + (left >= 0 ? ' left' : ' late'), left >= 0 ? 'yellow' : 'red'), order: new Date(c.retry.dueAt).getTime() };
    }
    // A follow-up has a date, and can have a time. With a time it is overdue from that minute; without, from the next day.
    const next = c.nextFollowUp, timed = next.length > 10;
    const at = new Date(timed ? next : next + 'T23:59:00').getTime();
    const late = Math.round((new Date(Kit.today()) - new Date(next.slice(0, 10))) / 86400000);
    const clock = timed ? new Date(next).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
    const passed = timed && at < Date.now();
    const pill = late > 0 ? Kit.pill('Overdue · ' + late + ' day(s)', 'red')
      : (late === 0 ? Kit.pill(passed ? 'Overdue · was ' + clock : 'Today' + (clock ? ' · ' + clock : ''), passed ? 'red' : 'yellow')
        : Kit.pill(Kit.day(next).replace(/ \d{4}$/, '') + (clock ? ' · ' + clock : ''), 'grey'));
    return { why: ABOUT[c.stage], when: late > 0 || passed ? 'overdue' : (late === 0 ? 'today' : 'later'), pill: pill, order: at };
  }

  // The Follow-up calls list. Give a stage to show only that stage's clients; leave it out for everyone.
  function followUps(ctx, stage, title) {
    const key = stage || 'all';
    const due = ctx.all.filter(function (c) { return STAGE[c.stage] && ctx.match(c) && (!stage || c.stage === stage) && (c.retry || c.nextFollowUp) && !(c.stage === 'qualified' && !c.spokeAt && !c.retry); })
      .map(function (c) { return { c: c, f: followUp(c) }; })
      .filter(function (x) { return !picked[key] || x.f.when === picked[key] || x.f.why === picked[key]; })
      .sort(function (a, b) { return a.f.order - b.f.order; });
    const types = stage ? TYPES.filter(function (t) { return ['overdue', 'today', 'later', ABOUT[stage], 'RNR'].indexOf(t[0]) >= 0; }) : TYPES;
    return mini(title || 'Follow-up calls',
      h('div', { style: 'width: 160px' }, Kit.select(types, picked[key], function (v) { picked[key] = v; ctx.update(); }, { placeholder: 'All follow-ups', label: 'Type of follow-up' })),
      due.map(function (x) {
        return { id: x.c.id, name: x.c.name, sub: (stage ? '' : STAGE[x.c.stage] + ' · ') + x.f.why + (SalesLogic.atStake(x.c) ? ' · ' + Kit.short(SalesLogic.atStake(x.c)) : ''), pill: x.f.pill, pick: function () { ctx.open(x.c); } };
      }), 'No follow-up calls are due.', SalesBin.followUps(ctx));
  }

  window.SalesLists = { mini: mini, followUps: followUps };
})();
