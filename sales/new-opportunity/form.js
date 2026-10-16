// New opportunity: a lead the SM brings in themselves (walk-in, architect, referral).
// It lands in Qualified leads and the 24-hour clock starts when it is saved.
(function () {
  const h = Kit.h;
  const P = SalesPieces;
  const PRODUCTS = ['Kitchen', 'Wardrobe', 'Kitchen + wardrobes', 'Backsplash', 'Countertop', 'Sunroof'];
  const SITE_TYPES = ['Apartment', 'Builder floor', 'Independent house', 'Villa'];
  let d = null;

  function sheet(ctx) {
    d = d || { name: '', phone: '', city: '', product: 'Kitchen', source: '', budget: '', siteType: '', segment: '', priority: '', note: '', layout: '' };
    const set = function (key) { return function (v) { d[key] = v; }; };
    return [
      h('div', { class: 'sheet-h' },
        h('div', null, h('h2', null, 'New opportunity')),
        Kit.btn('Close', ctx.close, 'small')),
      h('section', { class: 'card', style: 'padding: 16px; gap: 12px; max-width: 980px' },
        h('div', { class: 'g4' },
          Kit.field('Customer name', Kit.input(d.name, set('name'))),
          Kit.field('Phone', Kit.input(d.phone, set('phone'), { type: 'tel' })),
          Kit.field('City', Kit.input(d.city, set('city'))),
          Kit.field('Source', Kit.select(P.SOURCES, d.source, set('source'))),
          Kit.field('Product', Kit.select(PRODUCTS, d.product, set('product'), { placeholder: false })),
          Kit.field('Budget', Kit.input(d.budget, set('budget'), { placeholder: 'For example ₹30 to 35 L' })),
          Kit.field('Site type', Kit.select(SITE_TYPES, d.siteType, set('siteType'))),
          Kit.field('Segment', Kit.select(P.SEGMENTS, d.segment, set('segment'))),
          Kit.field('Priority prospect', Kit.select(['High', 'Medium', 'Low'], d.priority, set('priority'))),
          // The architect sits beside Priority prospect, in the rest of that row.
          h('div', { style: 'grid-column: span 3' }, Architects.picker(d.architect, d.architectId, function (now) { d.architect = now; if (now && !d.source) d.source = 'Architect reference'; ctx.update(); }, function (id) { d.architectId = id; ctx.update(); }))),
        Kit.field('Note', Kit.input(d.note, set('note'))),
        h('div', { class: 'line' },
          h('span', { class: 'flexrow' }, h('span', null, 'Layout', d.layout ? h('span', { class: 'sub' }, ' · ' + d.layout.name) : null),
            Kit.upload('Upload', d.layout, function (file) { d.layout = file; ctx.update(); })),
          h('span', { class: 'flexrow' },
            Kit.warn(d, 'span'),
            Kit.btn('Save opportunity', function () {
              if (!d.name.trim() || !d.phone.trim() || !d.source) { d.msg = 'Name, phone and source are needed.'; return ctx.update(); }
              const c = {
                id: 'c' + Date.now(), name: d.name.trim(), phone: d.phone.trim(), city: d.city.trim() || 'City not set', product: d.product,
                source: d.source, budget: d.budget, siteType: d.siteType, segment: d.segment, priority: d.priority, note: d.note,
                pid: SalesLogic.nextId(ctx.everyone, 'pid', 'P-', 1000), cid: SalesLogic.nextId(ctx.everyone, 'cid', 'C-', 2200), owner: Sales.me.id,
                stage: 'qualified', receivedAt: Kit.now(), ownLead: true, sm: Sales.me.name
              };
              if (d.architect) { c.order = { products: [] }; Architects.put(c, Architects.find(d.architectId)); }
              const file = d.layout;
              const done = function (name) {
                if (name) c.docs = { layout: name };
                d = null;
                ctx.update(function () { ctx.add(c); });
                ctx.open(c);
              };
              if (file) Kit.store.sendFile(c.id, file).then(done); else done('');
            }, 'dark'))))
    ];
  }

  Sales.addAction({ id: 'new-opportunity', label: 'New opportunity', sheet: sheet });
})();
