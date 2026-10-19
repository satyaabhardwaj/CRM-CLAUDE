// Design · Pre-design: the pages on the left while the sales person is still the point of contact
// (proposals to make, timelines, with Sales, booking amount coming in, all pre-design clients), and what each shows.
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const D = window.DesignParts;
  const S = D.state;
  const fact = D.fact, topFacts = D.topFacts, isRevision = D.isRevision, lastRevision = D.lastRevision, STEP = D.STEP, POST = D.POST, short = D.short, salesLine = D.salesLine, owed = D.owed, tasks = D.tasks;

  // The list of pages, with their counts.
  D.prePages = function (all, step, inDesign) {
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
  };

  // The main area for a pre-design page.
  D.preMain = function (ctx, all, step, inDesign, see) {
      if (ctx.page === 'timelines') {
        const times = all.filter(function (c) { return c.stage === 'booked' && !L.handed(c) && !!c.timeline.handover; });
        return h('div', { class: 'onelist' }, Kit.list('Timelines · overwrite a date if it cannot be met', null,
          times.map(function (c) {
            return { name: c.name, sub: salesLine(c) + ' · handover ' + (c.timeline.handover ? Kit.day(c.timeline.handover) : 'not set') + ' · ' + c.timeline.type,
              pill: Kit.pill(c.approvals.timeline === 'Overwritten' ? 'Overwritten' : 'From Sales', c.approvals.timeline === 'Overwritten' ? 'yellow' : 'grey'), pick: function () { ctx.show({ kind: 'timeline', id: c.id }); } };
          }), 'No timelines yet.'));
      } else if (ctx.page === 'make') {
        const asks = step('withDesign').filter(function (c) { return !S.designer || c.design.designer === S.designer; })
          .sort(function (a, b) { return new Date(a.design.stepAt || 0) - new Date(b.design.stepAt || 0); });
        const sent = all.filter(function (c) { return c.design.proposals.some(function (p) { return Kit.hoursSince(p.receivedAt) <= 72; }); }).length;
        return h('div', { class: 'onelist' }, Kit.list('Proposals to make',
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
        return h('div', { class: 'onelist' }, Kit.list(titles[ctx.page] || titles.all, h('span', { class: 'sub' }, 'The sales person is the point of contact'),
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
  };
})();
