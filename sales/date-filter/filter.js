// The date dropdown in the top bar. It filters clients by the day the lead was received.
(function () {
  const h = Kit.h;
  const RANGES = [['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastMonth', 'Last month'], ['custom', 'Custom dates']];
  const view = { range: 'all', from: '', to: '' };

  function bounds() {
    const now = new Date();
    const day = function (d) { return Kit.ymd(d); };
    if (view.range === 'today') return [day(now), day(now)];
    if (view.range === 'week') { const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return [day(start), day(now)]; }
    if (view.range === 'month') return [day(new Date(now.getFullYear(), now.getMonth(), 1)), day(now)];
    if (view.range === 'lastMonth') return [day(new Date(now.getFullYear(), now.getMonth() - 1, 1)), day(new Date(now.getFullYear(), now.getMonth(), 0))];
    if (view.range === 'custom') return [view.from || '0000-01-01', view.to || '9999-12-31'];
    return null;
  }

  Sales.addFilter({
    id: 'dates',
    control: function (rerender) {
      return h('div', { class: 'flexrow' },
        h('div', { style: 'width: 140px' }, Kit.select(RANGES, view.range, function (v) { view.range = v; rerender(); }, { placeholder: false, label: 'Dates' })),
        view.range === 'custom' ? h('div', { style: 'width: 140px' }, Kit.input(view.from, function (v) { view.from = v; rerender(); }, { type: 'date', label: 'From' })) : null,
        view.range === 'custom' ? h('div', { style: 'width: 140px' }, Kit.input(view.to, function (v) { view.to = v; rerender(); }, { type: 'date', label: 'To' })) : null);
    },
    test: function (c) {
      const b = bounds();
      if (!b) return true;
      const got = Kit.ymd(new Date(c.receivedAt));
      return got >= b[0] && got <= b[1];
    }
  });
})();
