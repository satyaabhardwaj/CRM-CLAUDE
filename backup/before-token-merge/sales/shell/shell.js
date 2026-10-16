// The frame around every sales dashboard: top bar, workflow list, the window that opens for a client.
// It does not know what any dashboard shows. Dashboards add themselves with Sales.register().
(function () {
  const h = Kit.h;
  const L = SalesLogic;
  // Who is using the screen. Real logins replace this later.
  const Sales = { dashboards: [], me: People.list[0] };
  const state = { route: '', picked: {}, open: false, find: '' };
  let root = null;
  // The workflow panel opens only after the mouse has rested on the strip for three seconds.
  const NAV_WAIT = 3000;
  let navOpen = false;
  let navTimer = null;
  function watchNav() {
    document.addEventListener('mousemove', function (e) {
      const inside = e.target.closest && e.target.closest('.nav');
      if (inside) {
        if (!navOpen && !navTimer) navTimer = setTimeout(function () { navTimer = null; navOpen = true; const el = document.querySelector('.nav'); if (el) el.classList.add('open'); }, NAV_WAIT);
        return;
      }
      clearTimeout(navTimer); navTimer = null;
      if (navOpen) { navOpen = false; const el = document.querySelector('.nav'); if (el) el.classList.remove('open'); }
    });
    // A click anywhere on the closed strip opens the panel straight away, without the wait.
    document.addEventListener('click', function (e) {
      const el = e.target.closest && e.target.closest('.nav');
      if (!el || navOpen) return;
      e.preventDefault(); e.stopPropagation();
      clearTimeout(navTimer); navTimer = null;
      navOpen = true; el.classList.add('open');
    }, true);
  }

  Sales.register = function (dashboard) { Sales.dashboards.push(dashboard); };
  // A button in the top bar that opens its own window (for example a new form).
  Sales.actions = [];
  Sales.addAction = function (action) { Sales.actions.push(action); };
  // Small tools in the top bar (for example the notification bell).
  Sales.topTools = [];
  Sales.addTopTool = function (tool) { Sales.topTools.push(tool); };
  // Parts shown inside the open workflow panel, under the stages.
  Sales.navParts = [];
  Sales.addNavPart = function (part) { Sales.navParts.push(part); };
  // Controls in the top bar that narrow what every screen shows (for example a person or a date range).
  Sales.filters = [];
  Sales.addFilter = function (filter) { Sales.filters.push(filter); };
  // One strip shown above the list on every screen.
  let strip = null;
  Sales.setStrip = function (fn) { strip = fn; };

  // A list card: title, a line under it, and rows you can click.
  Sales.table = function (o) {
    const cols = 'grid-template-columns: ' + o.cols;
    return h('section', { class: 'card list' },
      h('div', { class: 'list-h' }, h('div', null, h('h1', null, o.title)), o.tools || null),
      h('div', { class: 'rows', 'data-keep': 'rows' },
        h('div', { class: 'row head', style: cols }, o.heads.map(function (t) { return h('div', null, t); })),
        o.rows.length ? o.rows.map(function (r) {
          return h('button', { type: 'button', class: 'row' + (o.ctx.selected && o.ctx.isOpen && o.ctx.selected.id === r.id ? ' on' : ''), style: cols, onclick: function () { (o.onPick || o.ctx.select)(r.id); } },
            r.cells.map(function (cell) { return h('span', null, cell); }));
        }) : h('div', { class: 'empty' }, o.empty)));
  };

  function fit() {
    const app = document.getElementById('app');
    const scale = Math.min(window.innerWidth / 1440, 1.4);
    app.style.zoom = scale;
    app.style.height = (window.innerHeight / scale) + 'px';
  }

  function render() {
    fit();
    const keep = {};
    root.querySelectorAll('[data-keep]').forEach(function (el) { keep[el.getAttribute('data-keep')] = el.scrollTop; });

    const everyone = Kit.store.data.clients;
    everyone.forEach(L.ensure);
    const all = everyone.filter(function (c) { return Sales.filters.every(function (f) { return f.test(c); }); });
    const dash = Sales.dashboards.find(function (d) { return d.id === state.route; }) || Sales.dashboards[0];
    const find = state.find.trim().toLowerCase();
    // "Find a client" looks at the name, the project ID, the city and the phone, on every list of every screen.
    const match = function (c) { return !find || (c.name + ' ' + c.pid + ' ' + c.city + ' ' + (c.phone || '')).toLowerCase().indexOf(find) >= 0; };
    const mine = all.filter(function (c) { return (dash.page || c.stage === dash.id) && match(c); });
    const selected = mine.find(function (c) { return c.id === state.picked[dash.id]; }) || null;
    if (!selected) state.open = false;

    const ctx = {
      all: all, everyone: everyone, clients: mine, dash: dash.id, match: match,
      add: function (c) { everyone.push(c); }, selected: selected, isOpen: state.open,
      select: function (id) { state.picked[dash.id] = id; state.open = true; state.fresh = true; state.peek = ''; render(); },
      peek: function (stage) { state.peek = stage; render(); },
      close: function () { state.open = false; state.action = null; state.peek = ''; render(); },
      // A change is saved; a plain redraw (opening a section, a filter, a message) is not.
      update: function (change) { if (change) { change(); Kit.store.save(); } later(); },
      // Open a client inside a named dashboard (used for clients that have no stage screen of their own).
      goTo: function (id, c) { state.peek = ''; state.action = null; state.fresh = true; state.route = id; state.picked[id] = c.id; state.open = true; state.find = ''; location.hash = id; render(); },
      open: function (c) { state.peek = ''; state.action = null; state.fresh = true; state.route = c.stage; state.picked[c.stage] = c.id; state.open = true; state.find = ''; location.hash = c.stage; render(); }
    };

    const search = h('input', { type: 'search', placeholder: 'Find a client', 'aria-label': 'Find a client', style: 'width: 180px' });
    search.value = state.find;
    // The list narrows as you type.
    search.addEventListener('input', function () { state.find = search.value; later(); });

    // The workflow list is a slim strip. It opens wide, with more detail, when the mouse is on it.
    // Stages come first. Under them, the full-screen dashboards (pages). Small links sit at the very bottom.
    const go = function (d) { return function () { state.route = d.id; state.open = false; location.hash = d.id; render(); }; };
    const tops = Sales.dashboards.filter(function (d) { return d.top; });
    const stages = Sales.dashboards.filter(function (d) { return !d.page || d.flow; });
    const pages = Sales.dashboards.filter(function (d) { return d.page && !d.small && !d.top && !d.flow; });
    const small = Sales.dashboards.filter(function (d) { return d.page && d.small; });
    const nav = h('nav', { class: 'nav' + (navOpen ? ' open' : ''), 'aria-label': 'My workflow' }, h('div', { class: 'nav-in' },
      h('div', { class: 'stages' }, tops.map(function (d) {
        return h('button', { type: 'button', class: d.id === dash.id ? 'on' : '', 'aria-label': d.title, onclick: go(d) },
          h('span', { class: 'slim' }, h('small', { style: 'font-size: 11px; font-weight: 600; padding: 6px 0' }, d.short || d.title)),
          h('span', { class: 'wide' }, h('span', { class: 'line' }, h('b', null, d.title)), d.summary ? h('small', null, d.summary(all)) : null));
      })),
      h('div', { class: 'cap', style: 'margin-top: 8px' }, h('span', { class: 'wide' }, 'My workflow'), h('span', { class: 'slim' }, 'Flow')),
      h('div', { class: 'stages' }, stages.map(function (d) {
        const list = d.flow ? all : all.filter(function (c) { return c.stage === d.id; });
        const n = d.count ? d.count(all) : list.length;
        return h('button', { type: 'button', class: d.id === dash.id ? 'on' : '', 'aria-label': d.title + ', ' + n, onclick: go(d) },
          h('span', { class: 'slim' }, h('b', null, n), h('small', null, d.short || d.title)),
          h('span', { class: 'wide' }, h('span', { class: 'line' }, h('b', null, d.title), h('b', null, n)), d.summary ? h('small', null, d.summary(list)) : null));
      })),
      h('div', { class: 'cap', style: 'margin-top: 8px' }, h('span', { class: 'wide' }, 'Dashboards'), h('span', { class: 'slim' }, 'More')),
      h('div', { class: 'stages' }, pages.map(function (d) {
        return h('button', { type: 'button', class: d.id === dash.id ? 'on' : '', 'aria-label': d.title, onclick: go(d) },
          h('span', { class: 'slim' }, h('small', { style: 'font-size: 11px; font-weight: 600; padding: 4px 0' }, d.short || d.title)),
          h('span', { class: 'wide' }, h('span', { class: 'line' }, h('b', null, d.title)), d.summary ? h('small', null, d.summary(all)) : null));
      })),
      h('div', { class: 'extra' }, h('div', { class: 'navlinks' }, small.map(function (d) { return h('button', { type: 'button', onclick: go(d) }, d.label ? d.label(all) : d.title); })))));

    // A page is a full-screen dashboard: no strip on top and no boxes on the right.
    const main = h('main', { class: 'main' }, strip && (!dash.page || dash.frame) ? strip(ctx) : null, dash.table(ctx));
    let windowEls = [];
    // The open client can be looked at through an earlier stage's screen without moving them back.
    const lens = state.open && selected && state.peek && state.peek !== dash.id ? Sales.dashboards.find(function (d) { return d.id === state.peek && d.sheet; }) : null;
    ctx.viewing = lens ? lens.id : dash.id;
    if (state.open && selected && (lens || dash).sheet) {
      const parts = (lens || dash).sheet(selected, ctx);
      const bodyEl = h('div', { class: 'sheet-b', 'data-keep': 'sheet' }, parts.slice(1));
      windowEls = [
        h('div', { class: 'veil', onclick: ctx.close }),
        h('div', { class: 'sheet' + (state.fresh ? ' rise' : ''), role: 'dialog', 'aria-label': selected.name }, parts[0], bodyEl)];
    }
    const action = Sales.actions.find(function (a) { return a.id === state.action; });
    if (action) {
      const parts = action.sheet(ctx);
      windowEls = [
        h('div', { class: 'veil', onclick: ctx.close }),
        h('div', { class: 'sheet' + (state.fresh ? ' rise' : ''), role: 'dialog', 'aria-label': action.label }, parts[0], h('div', { class: 'sheet-b', 'data-keep': 'sheet' }, parts.slice(1)))];
    }
    state.fresh = false;

    Kit.keepFocus(root, function () {
    root.replaceChildren(
      h('header', { class: 'top' },
        h('div', { class: 'flexrow' }, h('div', { class: 'brand' }, 'MAGPPIE ', h('span', null, 'Sales')), Kit.depts('sales')),
        h('div', { class: 'flexrow' },
          Sales.topTools.map(function (tool) { return tool(ctx); }),
          Sales.actions.filter(function (a) { return a.place !== 'nav'; }).map(function (a) { return Kit.btn(a.label, function () { state.action = a.id; state.open = false; state.fresh = true; render(); }, 'dark'); }),
          Sales.filters.map(function (f) { return f.control(later); }),
          search, null)),
      h('div', { class: 'body' }, nav, main, dash.page && !dash.frame ? null : h('aside', { class: 'rail', 'aria-label': 'Also today', 'data-keep': 'rail' }, SalesPanel.render(ctx)), windowEls));
    });

    root.querySelectorAll('[data-keep]').forEach(function (el) { const top = keep[el.getAttribute('data-keep')]; if (top) el.scrollTop = top; });
  }

  // Redraw soon, at a moment that does not swallow a click or shut an open dropdown.
  const later = Kit.calm(render);

  Sales.start = function () {
    root = document.getElementById('app');
    state.route = location.hash.replace('#', '');
    fit();
    window.addEventListener('resize', fit);
    watchNav();
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (state.open || state.action)) { state.open = false; state.action = null; render(); } });
    Kit.store.load().then(function () {
      render();
      Kit.store.watch(render);
      // Clocks move on their own: refresh every minute unless the person is in the middle of something.
      setInterval(function () { if (!Kit.busy()) render(); }, 60000);
      // The browser's Back and Forward buttons move between dashboards too.
      window.addEventListener('hashchange', function () {
        const to = location.hash.replace('#', '');
        if (to === state.route) return;
        state.route = to; state.open = false; state.action = null; state.peek = '';
        render();
      });
    });
  };

  window.Sales = Sales;
})();
