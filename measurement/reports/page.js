(function () {
  const M = MeasurementParts, h = Kit.h;
  M.pages.reports = function (ctx, list, n, stats) {
    const stages = M.STAGES.map(stage => ({ stage, counts: M.count(list.filter(r => r.stage === stage)) }));
    const problems = list.flatMap(r => r.problems.map(p => ({ r, p })));
    const reportRows = [['Visit type', 'Open', 'Scheduled', 'To schedule', 'Late', 'Done'], ...stages.map(s => [s.stage, s.counts.Open, s.counts.Scheduled, s.counts['To Schedule'], s.counts.Late, s.counts.Done])];
    const problemRows = [['Client', 'Visit type', 'Problem', 'Reason', 'Status', 'Assigned to', 'Due'], ...problems.map(x => [x.r.client, x.r.stage, x.p.title, x.p.reason, x.p.status, x.p.assignee, x.p.due])];
    const feedback = h('span', { class: 'sub', role: 'status' });
    const problemView = M.view.report === 'problems';
    const csv = () => { M.downloadCsv([['MAGPPIE Measurement', M.filterSummary(ctx)], ['Generated', Kit.now()], ...(problemView ? problemRows : reportRows)], problemView ? 'measurement-problems.csv' : 'measurement-summary.csv'); feedback.textContent = 'CSV prepared. Check browser downloads.'; };
    const pdf = () => {
      if (!window.jspdf) { feedback.textContent = 'PDF library unavailable. Use CSV or reload and retry.'; return; }
      try {
        const sections = problemView ? problems.map(x => ({ heading: x.r.client + ' - ' + x.r.stage, rows: [['Problem', x.p.title], ['Reason', x.p.reason], ['Status', x.p.status], ['Assigned to', x.p.assignee], ['Due', x.p.due]] })) : stages.map(s => ({ heading: s.stage, rows: Object.entries(s.counts) }));
        Kit.pdf('measurement-report.pdf', 'MAGPPIE Measurement ' + (problemView ? 'Problems' : 'Summary'), M.filterSummary(ctx) + ' | Generated ' + Kit.dayTime(Kit.now()), sections.length ? sections : [{ heading: 'No matching problems', rows: [['Count', 0]] }]);
        feedback.textContent = 'PDF prepared. Check browser downloads.';
      } catch (e) { feedback.textContent = 'PDF could not be created. Try CSV instead.'; }
    };
    const controls = h('div', { class: 'm-toolbar' }, Kit.btn('Summary', () => { M.view.report = 'summary'; ctx.update(); }, !problemView ? 'dark' : ''), M.live && M.live.enabled ? null : Kit.btn('Problems (' + problems.length + ')', () => { M.view.report = 'problems'; ctx.update(); }, problemView ? 'dark' : ''), Kit.btn('Export CSV', csv), Kit.btn('Export PDF', pdf), feedback);
    const stageTable = h('div', { class: 'm-table-wrap' }, h('table', { class: 'm-table' }, h('caption', null, 'Stage summary'), h('thead', null, h('tr', null, reportRows[0].map(s => h('th', { scope: 'col' }, s)), h('th', { scope: 'col' }, 'Requests'))),
      h('tbody', null, stages.map((s, i) => h('tr', null, reportRows[i + 1].map((v, k) => h('td', { 'data-label': reportRows[0][k] }, v)), h('td', { 'data-label': 'Requests' }, Kit.btn('View', () => ctx.go(M.stageId(s.stage), 'requests'), 'small')))))));
    const by = key => M.grouped(list, key).map(g => [g.name, g.items.length]);
    const problemList = Kit.list('Reported problems', null, problems.map(x => ({ name: x.p.title, sub: x.r.client + ' · ' + x.r.stage + ' · ' + x.p.reason + ' · ' + (x.p.assignee || 'Not assigned'), pill: Kit.pill(x.p.status, x.p.status === 'Resolved' ? 'green' : 'yellow'), pick: () => ctx.show({ id: x.r.id }) })), 'No problems match these filters.');
    return [stats, controls, problemView ? h('div', { class: 'onelist' }, problemList) : [stageTable, h('div', { class: 'cols' },
      M.bars('By visit type', '', stages.map(s => [s.stage, s.counts.Open + s.counts.Done]), ''),
      M.bars('By status', '', [['Scheduled', n.Scheduled], ['To schedule', n['To Schedule']], ['Done', n.Done]], ''),
      M.bars('Work by assigned person', '', by('assignee'), 'No requests yet.'), M.bars('By city', '', by('city'), 'No requests yet.'), M.bars('By zone', '', by('zone'), 'No requests yet.'),
      Kit.card('Data quality', '', 'grey', h('p', null, list.filter(r => !r.date && r.status !== 'Done').length + ' open requests without a visit date'), h('p', null, list.filter(r => !r.assignee).length + ' not assigned'), h('p', null, list.filter(r => !r.coordinates).length + ' without exact coordinates'), h('p', { class: 'sub' }, 'Time-target performance is unavailable until approved targets and assignment timestamps are defined.')))]];
  };
})();
