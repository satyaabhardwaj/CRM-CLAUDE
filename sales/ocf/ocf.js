// The Order Closure Form (OCF), made as a PDF in the same order as the company's own sheet (OCF R5):
// letterhead, document number and date, client and billing block, the four dates, the product table,
// signatures, the three payment stages, the terms, the installation terms, and signatures again.
// The numbers come from the client's Order card. Nothing is typed twice.
(function () {
  const L = SalesLogic;
  const T = window.OCFText;
  const clean = function (v) { return String(v == null || v === '' ? '' : v).replace(/₹\s?/g, 'Rs ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/•/g, '-').replace(/[^\x20-\x7E]/g, ''); };
  const rs = function (n) { return n ? 'Rs ' + Kit.commas(Math.round(n)) : '-'; };

  // Builds the form. Gives back the PDF, its file name, and where the signature lines are (for Zoho Sign).
  function build(c) {
    if (!window.jspdf) return null;
    const marks = [];
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const left = 44, right = 551, mid = 310;
    let y = 50;
    const room = function (need) { if (y + need > 800) { doc.addPage(); y = 46; } };
    const text = function (s, x, size, bold, grey) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size || 9.5); doc.setTextColor(grey ? 110 : 20); doc.text(clean(s), x, y); };
    const para = function (s, indent, bold) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(20);
      const lines = doc.splitTextToSize(clean(s), right - left - (indent || 0));
      room(lines.length * 10.5 + 2);
      lines.forEach(function (ln) { doc.text(ln, left + (indent || 0), y); y += 10.5; });
      y += 2.5;
    };
    const pair = function (label, value, x) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110); doc.text(clean(label), x, y); doc.setTextColor(20);
      // A long name is set a little smaller so that it fits on its line whole, never cut off.
      const shown = clean(value) || '________________', wide = (x === left ? mid - 12 : right) - (x + 108);
      let size = 9.5;
      while (size > 6.5 && doc.getTextWidth(shown) * size / doc.getFontSize() > wide) size -= 0.5;
      doc.setFontSize(size); doc.text(shown, x + 108, y); doc.setFontSize(9.5); };
    const day = function (v) { return v ? Kit.day(v) : '________________'; };

    const t = L.totals(c), d = L.dates(c);
    const bill = c.billing.find(function (b) { return b.id === c.billingPick; }) || c.billing[0];
    const site = (c.people || []).filter(function (p) { return p.relation === 'Site in-charge'; })[0];

    // Letterhead
    text('MAGPPIE', left, 20, true); doc.setFontSize(9); doc.setTextColor(110); doc.text('www.magppie.com', right, y, { align: 'right' }); y += 15;
    text('Magppie Silverstone Pvt. Ltd', left, 10, true); y += 12;
    text('352, Sultanpur, MG Road, New Delhi - 110030', left, 9, false, true); y += 22;
    text('Order Closure Form (OCF)', left, 15, true); y += 18;
    text('Document No - M01', left, 9.5); doc.text('Date: ' + clean(day(c.ocfAt || Kit.now())), right, y, { align: 'right' }); y += 12;
    text('To be signed - By Client & Magppie', left, 9, false, true); y += 11;
    text('Stage - At the time of Order Closure', left, 9, false, true); y += 11;
    text('Responsible Team Member/Department - Sales Team', left, 9, false, true); y += 18;
    doc.setDrawColor(200); doc.line(left, y - 8, right, y - 8);

    // Client block, two columns as on the sheet
    [['Client Name:', c.name, 'Architect Name:', c.order.architectCode || ''],
     ['Registered Mobile No:', c.phone, 'ERP Code:', c.pid],
     ['E-Mail:', c.email, 'Site In-charge number:', site ? site.phone : ''],
     ['Site Address:', c.siteAddress || (c.city !== 'City not set' ? c.city : ''), 'Site In-charge Name:', site ? site.name : (c.siteContact || '')]]
      .forEach(function (r) { pair(r[0], r[1], left); pair(r[2], r[3], mid); y += 14; });
    y += 4; text('Billing Details:', mid, 9.5, true); y += 14;
    pair('Name:', bill.name, mid); y += 14;
    pair('GST No:', bill.gst, mid); y += 14;
    pair('House Warming:', d ? Kit.day(d.handover) : '', left); pair('Address:', bill.sameAsSite ? c.siteAddress : bill.address, mid); y += 14;
    pair('Dispatch Date', d ? Kit.day(d.dispatch) : '', left); y += 14;
    pair('PDI Date', d ? Kit.day(d.pdi) : '', left); y += 14;
    pair('Production Drawing', d ? Kit.day(d.signoff) : '', left); y += 20;

    // Product table. Text columns start at their left edge; every money column ends at its own right edge,
    // so no two columns can run into each other.
    const cols = [
      { name: 'S No', x: left + 4, right: false }, { name: 'Product', x: left + 34, right: false }, { name: 'Qty', x: 200, right: true },
      { name: 'Estimate Price', x: 274, right: true }, { name: 'Discount Offered', x: 352, right: true }, { name: 'Final Price', x: 420, right: true },
      { name: 'GST', x: 484, right: true }, { name: 'Free acc.', x: right - 4, right: true }
    ];
    const rowOf = function (cells, bold, shade) {
      if (shade) { doc.setFillColor(shade); doc.rect(left, y - 11, right - left, 16, 'F'); }
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8.5); doc.setTextColor(20);
      cells.forEach(function (v, i) { doc.text(clean(v), cols[i].x, y, cols[i].right ? { align: 'right' } : undefined); });
      y += 5; doc.setDrawColor(215); doc.line(left, y, right, y); y += 12;
    };
    rowOf(cols.map(function (x) { return x.name; }), true, 238);
    const share = function (n, part) { return t.base ? n * part / t.base : 0; };
    const items = c.order.products.length ? c.order.products : [{ product: 'Kitchen', value: 0 }];
    items.forEach(function (p, i) {
      const v = Number(p.value) || 0, disc = share(t.md, v), fin = v - disc;
      rowOf([String(i + 1), p.product || 'Kitchen', '1', rs(v), rs(disc), rs(fin), rs(fin * 0.18), rs(share(t.freight, v))]);
    });
    rowOf(['', 'Total', String(items.length), rs(t.base), rs(t.md), rs(t.bankBase), rs(t.tax), rs(t.freight)], true, 246);
    y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(20);
    doc.text('Total payable by client', left, y); doc.text(clean(rs(t.total)), right - 4, y, { align: 'right' });
    y += 40;

    const signs = function () {
      room(70);
      // The signing box sits just above each line.
      const page = doc.getNumberOfPages() - 1;
      marks.push({ who: 'client', page: page, x: left, y: y - 30, w: 170, h: 28 }, { who: 'magppie', page: page, x: right - 190, y: y - 30, w: 190, h: 28 });
      doc.setDrawColor(120); doc.line(left, y, left + 170, y); doc.line(right - 190, y, right, y); y += 12;
      text("Client's Signature", left, 9); doc.text('Magppie Sales Team Signature', right - 190, y); y += 12;
      text('Date:', left, 9, false, true); doc.text('Date:', right - 190, y); y += 24;
    };
    signs();

    // Payment stages
    room(60); doc.setDrawColor(200); doc.line(left, y - 12, right, y - 12); text('Payment stages', left, 11, true); y += 15;
    T.stages.forEach(function (s) { para(s); });

    // Terms: a numbered heading starts a new block; lines such as "(1) ..." and "Stage 1 ..." sit under their point.
    y += 6; room(60); doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4); y += 10; text('Terms', left, 11, true); y += 15;
    T.terms.forEach(function (s) {
      const heading = /^\d+\. [A-Z][^:]{8,80}$/.test(s) && s.indexOf(':') < 0;
      const point = /^\d+\. /.test(s);
      if (heading) { y += 4; room(30); para(s, 0, true); } else para(s, point ? 10 : 22);
    });
    y += 6; room(60); doc.setDrawColor(200); doc.line(left, y - 4, right, y - 4); y += 10; text('Installation, handover and warranty', left, 11, true); y += 15;
    T.install.forEach(function (s) { para(s, /^\d+\. |^- \d+\. /.test(clean(s)) ? 10 : 22); });
    // The closing lines and the last signatures are kept together, never split across pages.
    y += 4; room(150);
    T.contacts.forEach(function (s, i) { para(s, i % 2 ? 10 : 0, i % 2 === 0); });
    if (c.design.designer) para('Designer assigned: ' + c.design.designer, 10);
    y += 30; signs();

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140); doc.text('Order Closure Form - ' + clean(c.name) + ' - ' + clean(c.pid) + ' - page ' + i + ' of ' + pages, left, 822); }
    const name = 'OCF-' + c.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + c.pid + '.pdf';
    return { doc: doc, name: name, marks: marks };
  }
  function make(c) {
    const made = build(c);
    if (!made) return;
    if (!(window.claude && window.claude.use)) return made.doc.save(made.name);
    window.claude.use('downloads').then(function (dl) { return dl ? dl.save({ filename: made.name, data: made.doc.output('blob') }) : made.doc.save(made.name); }).catch(function () {});
  }
  // The same form, ready to hand to the signing service: the PDF as text-safe data, plus the signature places.
  function forSigning(c) {
    const made = build(c);
    if (!made) return null;
    return { pdf: made.doc.output('datauristring').split(',')[1], filename: made.name, marks: made.marks };
  }

  window.OCF = { make: make, forSigning: forSigning };
})();
