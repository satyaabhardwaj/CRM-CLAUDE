// Accounts · PI (proforma invoice). Three of them: Booking (50%), Production (80%) and Dispatch (100%).
// The money asked for on a PI is only ever the bank amount; the management part is shown as discount (approved, and to be discussed).
//   Bank amount            = bank part of the OBV + 18% GST
//   Due at this stage      = bank amount x the stage % (cumulative: 50, 80, 100 on the SM plan)
//   Advance received       = money received in bank so far
//   Net due on this PI     = due at this stage - advance received (never below 0); split back into value and GST
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  const A = window.AccountsParts;
  A.PI = [['design', 'Booking'], ['drawing', 'Production'], ['dispatch', 'Dispatch']];
  A.piMaths = function (c, key) {
    const t = L.totals(c), pct = L.gatePct(c, key), got = L.received(c).bank;
    const due = Math.round(t.bank * pct / 100), net = Math.max(0, due - got);
    const netBase = Math.round(net / 1.18);
    return { pct: pct, bank: t.bank, bankBase: t.bankBase, gst: t.tax, due: due, got: got, net: net, netBase: netBase, netGst: net - netBase };
  };
  // The PI in Magppie's own layout (sample: Dr Himanshu, 17.10.2026), one table with three money columns:
  //   Order            | Offer Price | Less: Management Discount | Final Price
  //   each product       OBV           management discount         bank part
  //   Total
  //   Add: GST @ 18%                                                GST on the bank part
  //   Add: Free Accessories            free accessories
  //   Total                                                         bank amount with GST
  //   Less: Discount Approved          management money received
  //   Less: Discount to be Discuss     management still to come (green)
  //   (stage PIs only) Payable at this stage: X%                    bank amount x X%
  //   Less: Payment Received                                        received in bank
  //   Balance Due                                                   what is due on this PI
  A.piDownload = function (c, key, name) {
    if (!window.jspdf) return;
    const p = A.piMaths(c, key), t = L.totals(c), got = L.received(c);
    const no = 'PI-' + c.pid.replace('P-', '') + '-' + name.charAt(0) + '-' + Kit.today().replace(/-/g, '');
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const rs = function (n) { return n == null || n === '' ? '' : Kit.commas(n); };
    const clean = function (v) { return String(v == null ? '' : v).replace(/[^\x20-\x7E]/g, ''); };
    const X = [40, 300, 400, 500, 555], ROW = 20;
    let y = 60;
    doc.setLineWidth(0.8);
    const box = function (h) { [X[0], X[1], X[2], X[3], X[4]].forEach(function (x) { doc.line(x, y, x, y + h); }); doc.line(X[0], y + h, X[4], y + h); };
    const row = function (label, a, b, cc, opt) {
      opt = opt || {};
      if (opt.green) { doc.setFillColor(146, 208, 80); doc.rect(X[2], y, X[3] - X[2], ROW, 'F'); }
      box(ROW);
      doc.setFont('helvetica', opt.bold ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(0);
      doc.text(clean(label), X[0] + 4, y + 14);
      [[a, X[2]], [b, X[3]], [cc, X[4]]].forEach(function (v) { if (v[0] !== '' && v[0] != null) doc.text(rs(v[0]), v[1] - 4, y + 14, { align: 'right' }); });
      y += ROW;
    };
    // Title row
    doc.line(X[0], y, X[4], y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.line(X[0], y, X[0], y + 22); doc.line(X[4], y, X[4], y + 22); doc.line(X[0], y + 22, X[4], y + 22);
    doc.text(clean(c.name + ' (' + Kit.today().split('-').reverse().join('.') + ')'), (X[0] + X[4]) / 2, y + 15, { align: 'center' });
    y += 22;
    // Header row
    box(36);
    doc.setFontSize(9.5);
    doc.text('Order', (X[0] + X[1]) / 2, y + 21, { align: 'center' });
    doc.text('Offer Price', (X[1] + X[2]) / 2, y + 21, { align: 'center' });
    doc.text(['Less :', 'Management', 'Discount'], (X[2] + X[3]) / 2, y + 10, { align: 'center' });
    doc.text('Final Price', (X[3] + X[4]) / 2, y + 21, { align: 'center' });
    y += 36;
    const share = function (part, v) { return t.base ? Math.round(part * v / t.base) : 0; };
    (c.order.products.length ? c.order.products : [{ product: 'Modular Kitchen', value: t.base }]).forEach(function (pr) {
      const v = Number(pr.value) || 0, md = share(t.md, v);
      row(pr.product && pr.product !== 'Kitchen' ? pr.product : 'Modular Kitchen', v, md, v - md);
    });
    if (Number(c.order.installation)) { const v = Number(c.order.installation), md = share(t.md, v); row('Installation', v, md, v - md); }
    row('', '', '', '');
    row('Total', t.base, t.md, t.bankBase, { bold: true });
    row('', '', '', '');
    row('Add : GST @ 18%', '', '', t.tax);
    row('Add : Free Accessories', '', t.freight || '', '');
    row('', '', '', '');
    row('Total', '', '', t.bank, { bold: true });
    row('', '', '', '');
    row('Less : Discount Approved', '', got.md, '');
    row('Less : Discount to be Discuss', '', Math.max(0, t.mgmt - got.md), '', { green: true });
    if (p.pct < 100) row('Payable at ' + name.toLowerCase() + ' : ' + p.pct + '% of ' + rs(t.bank), '', '', p.due);
    row('Less : Payment Received', '', '', p.got);
    row('', '', '', '');
    row('Balance Due', '', '', p.net, { bold: true });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(clean(no + ' - ' + name + ' PI (' + p.pct + '%) - ' + c.pid + ' / ' + c.cid + ' - made by the Magppie CRM'), X[0], y + 18);
    const file = no + '.pdf';
    if (!(window.claude && window.claude.use)) doc.save(file);
    else window.claude.use('downloads').then(function (d) { return d ? d.save({ filename: file, data: doc.output('blob') }) : doc.save(file); }).catch(function () {});
    c.pis = c.pis || [];
    c.pis.push({ at: Kit.now(), stage: name, pct: p.pct, net: p.net, no: no });
  };
  A.piCard = function (c) {
    return Kit.card('PI · amount asked is the bank amount', '', 'blue',
      A.PI.map(function (x) {
        const p = A.piMaths(c, x[0]);
        return h('div', { class: 'line rule' }, h('span', null, h('b', null, x[1] + ' · ' + p.pct + '%'), h('span', { class: 'sub' }, ' · due ' + Kit.money(p.due) + ' · received ' + Kit.money(p.got) + ' · net ' + Kit.money(p.net))),
          Kit.btn('Download PI', function () { A.piDownload(c, x[0], x[1]); Kit.store.save(); }, 'small line'));
      }),
      (c.pis || []).length ? h('div', { class: 'hint' }, 'Made: ' + c.pis.slice(-3).map(function (x) { return x.stage + ' ' + Kit.day(x.at) + ' ' + Kit.money(x.net); }).join(' · ')) : null);
  };
})();
