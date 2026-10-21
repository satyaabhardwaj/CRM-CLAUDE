// Shared data/format/PDF services for native React screens. No DOM UI or legacy save lifecycle.
(function () {
  const Kit = {store: {data: null}};
  // Money, always with Indian commas.
  Kit.num = function (text) {
    const n = Number(String(text == null ? '' : text).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  Kit.commas = function (n) { return Math.round(Number(n) || 0).toLocaleString('en-IN'); };
  Kit.money = function (n) { return '₹' + Kit.commas(n); };
  // A plain number of lakhs, always two decimal places, cut not rounded: 1,69,42,760 shows as 169.42
  Kit.lakh = function (n) { return (Math.floor((Number(n) || 0) / 1000) / 100).toFixed(2); };
  // Money for every summary and dashboard: ₹169.42 L. The exact rupees stay on the client's own order screens.
  Kit.short = function (n) { return '₹' + Kit.lakh(n) + ' L'; };

  // Dates.
  Kit.now = function () { return new Date().toISOString(); };
  Kit.today = function () { return Kit.ymd(new Date()); };
  Kit.ymd = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  Kit.addDays = function (ymd, days) {
    const d = new Date(ymd + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return Kit.ymd(d);
  };
  Kit.day = function (iso) {
    if (!iso) return 'Not set';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  Kit.dayTime = function (iso) {
    if (!iso) return 'Not set';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  };
  // The bank-only view (online, second password): only money that goes through the bank is shown.
  Kit.bankOnly = function () { return !!window.CRM_BANK_ONLY; };
  // A follow-up can carry a time as well as a date. Shown with the time when it has one.
  Kit.when = function (v) { return !v ? 'Not set' : (v.length > 10 ? Kit.dayTime(v) : Kit.day(v)); };
  // What a call result is called on screen. The saved value stays the same, so old records keep working.
  const OUTCOME = { 'No answer': 'RNR · ring, no response', 'Asked to call later': 'Rescheduled for later' };
  Kit.outcome = function (v) { return OUTCOME[v] || v; };
  Kit.outcomes = function (list) { return list.map(function (v) { return [v, Kit.outcome(v)]; }); };
  Kit.hoursSince = function (iso) { return (Date.now() - new Date(iso).getTime()) / 3600000; };
  Kit.daysSince = function (iso) { return iso ? Math.floor(Kit.hoursSince(iso) / 24) : 0; };
  Kit.span = function (hours) {
    const n = Math.abs(hours);
    if (n < 1) return Math.max(1, Math.round(n * 60)) + ' min';
    if (n < 48) return Math.round(n) + 'h';
    return Math.round(n / 24) + ' days';
  };

  Kit.news = function (c, text, tone, from) {
    c.news = c.news || [];
    c.news.unshift({ at: Kit.now(), text: text, tone: tone || 'green', from: from || '' });
    c.news = c.news.slice(0, 20);
  };

  // The overview screen belongs to the head of sales, so it carries her name instead of the word "Management".
  Kit.headName = function () { const p = window.People && People.list[0]; return p ? p.name : 'Management'; };
  Kit.pdf = function (filename, title, subtitle, sections) {
    if (!window.jspdf) return;
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const clean = function (v) { return String(v == null || v === '' ? '-' : v).replace(/₹\s?/g, 'Rs ').replace(/·/g, '-').replace(/→/g, 'to').replace(/[^\x20-\x7E]/g, ''); };
    const left = 44, right = 551, labelW = 170;
    let y = 56;
    const room = function (need) { if (y + need > 790) { doc.addPage(); y = 56; } };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(clean(title), left, y); y += 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110);
    doc.splitTextToSize(clean(subtitle), right - left).forEach(function (line) { doc.text(line, left, y); y += 12; });
    y += 6;
    sections.forEach(function (s) {
      if (!s || !s.rows || !s.rows.length) return;
      room(40);
      doc.setDrawColor(215); doc.line(left, y, right, y); y += 16;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(20); doc.text(clean(s.heading), left, y); y += 15;
      doc.setFontSize(9.5);
      s.rows.forEach(function (r) {
        const lines = doc.splitTextToSize(clean(r[1]), right - left - labelW);
        room(lines.length * 12 + 2);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(110); doc.text(clean(r[0]), left, y);
        doc.setTextColor(20); doc.text(lines, left + labelW, y);
        y += lines.length * 12 + 3;
      });
      y += 6;
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text('MAGPPIE CRM - made ' + clean(Kit.dayTime(Kit.now())) + ' - page ' + i + ' of ' + pages, left, 822); }
    // On the online copy the page has to ask the viewer before a file is saved. On the laptop it just saves.
    if (!(window.claude && window.claude.use)) return doc.save(filename);
    window.claude.use('downloads').then(function (d) { return d ? d.save({ filename: filename, data: doc.output('blob') }) : doc.save(filename); }).catch(function () {});
  };

  Kit.newsFrom = function (n) { return n.from || (/accounts/i.test(n.text) ? 'Accounts' : (/design|proposal/i.test(n.text) ? 'Design' : 'Sales')); };
  window.Kit = Kit;
})();
