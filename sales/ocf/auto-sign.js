// Automation: the moment a client's token is in, their OCF is sent for signature by itself.
// It runs while a Sales screen is open, because the OCF is made there. It needs Zoho Sign switched on
// (sign/keys.env) and the client's email. Each client is tried once; after that the button on the OCF card is used.
// While test mode is on in the keys file, everything goes to the test address, never to the client.
(function () {
  const L = SalesLogic;
  let on = false, busy = false;
  const ready = function (c) { return c.stage === 'booked' && L.tokenIn(c) && L.totals(c).total > 0 && c.email && !c.ocfSign && !c.ocfSignTried; };
  function tick() {
    if (!on || busy || !window.OCF || !Kit.store.data || Kit.busy()) return;
    const c = Kit.store.data.clients.filter(ready)[0];
    if (!c) return;
    const form = window.OCF.forSigning(c);
    if (!form) return;
    busy = true;
    fetch('/api/sign/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf: form.pdf, filename: form.filename, marks: form.marks, title: 'Order Closure Form · ' + c.name + ' · ' + c.pid, name: c.person || c.name, email: c.email }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); }, function () { return {}; })
      .then(function (out) {
        busy = false;
        c.ocfSignTried = Kit.now();
        if (out.id) {
          c.ocfSign = { id: out.id, status: 'inprogress', sentAt: Kit.now(), to: out.sent_to, test: !!out.test, filename: form.filename, auto: true };
          c.ocfAsked = true; c.ocfAt = c.ocfAt || Kit.now();
          Kit.news(c, 'OCF sent for signature by itself, as the token is in', 'blue', 'Sales');
        } else {
          c.ocfSignProblem = out.error || 'It did not go through.';
        }
        Kit.store.save();
      });
  }
  fetch('/api/sign/status').then(function (r) { return r.json(); }).then(function (s) { on = !!(s && s.on); if (on) setInterval(tick, 15000); }).catch(function () {});
})();
