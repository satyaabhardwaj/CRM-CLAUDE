(function () {
  const M = MeasurementParts, h = Kit.h, view = M.view;
  let activeMap = null, outline = null;
  M.pages.areas = function (ctx, list, n, stats) {
    if (activeMap) { activeMap.remove(); activeMap = null; }
    const groups = M.grouped(list, view.group), selected = view.area ? list.filter(r => (r[view.group] || 'Not provided') === view.area) : list;
    const located = selected.filter(r => r.coordinates), canvas = h('div', { class: 'm-map', 'aria-label': 'Measurement site map' });
    const feedback = h('p', { class: 'sub' }, located.length + ' requests with exact coordinates · ' + (selected.length - located.length) + ' missing coordinates');
    const mapCard = Kit.card('Site map', located.length + ' located', 'grey',
      h('div', { class: 'flexrow' }, Kit.btn('Fit sites', () => { if (activeMap && located.length) activeMap.fitBounds(located.map(r => r.coordinates), { padding: [30, 30], maxZoom: 14 }); }, 'small', { disabled: !located.length }),
        view.area ? Kit.btn('Clear area', () => { view.area = ''; ctx.update(); }, 'small') : null), canvas, feedback,
      h('p', { class: 'sub' }, 'Offline geographic overview. Only recorded exact coordinates are shown; city centres are never used as site locations.'));
    requestAnimationFrame(() => {
      if (!canvas.isConnected) return;
      if (!window.L) { feedback.textContent = 'Map could not load. Area groups and request details are still available.'; return; }
      const map = activeMap = window.L.map(canvas, { attributionControl: true }).setView([22.5, 79], 4);
      map.attributionControl.addAttribution('Natural Earth · public domain');
      const layer = window.L.layerGroup().addTo(map);
      const draw = () => {
        layer.clearLayers();
        M.source.clusters(located, map.getZoom()).forEach(group => {
          const marker = window.L.marker([group.position.lat, group.position.lng], { icon: window.L.divIcon({ className: 'm-pin', html: String(group.items.length), iconSize: [30, 30] }), title: group.items.length + ' measurement requests' }).addTo(layer);
          marker.bindPopup(h('div', null, group.items.map(r => h('div', { style: 'margin:8px 0' }, h('b', null, r.client), h('p', null, r.stage), Kit.btn('View request', () => ctx.show({ id: r.id }), 'small')))));
        });
      };
      draw(); map.on('zoomend', draw);
      const focused = located.find(r => r.id === view.mapRequest);
      if (focused) { map.setView(focused.coordinates, 12); view.mapRequest = ''; }
      else if (located.length) map.fitBounds(located.map(r => r.coordinates), { padding: [30, 30], maxZoom: 12 });
      const apply = data => { if (canvas.isConnected && activeMap === map) window.L.geoJSON(data, { style: { color: '#9cabb1', weight: 1, fillColor: '#f8faf9', fillOpacity: 1 }, interactive: false }).addTo(map).bringToBack(); };
      if (outline) apply(outline);
      else fetch('/measurement/vendor/world-outline.geojson').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { outline = data; apply(data); }).catch(() => { if (canvas.isConnected) feedback.textContent += ' · Map outline unavailable; coordinates remain accessible.'; });
      map.invalidateSize();
    });
    return [stats, h('div', { class: 'twolists' },
      Kit.list('Areas', Kit.select([['city', 'By city'], ['state', 'By state'], ['zone', 'By zone'], ['owner', 'By sales person'], ['assignee', 'By assigned person']], view.group, v => { view.group = v; view.area = ''; ctx.update(); }, { placeholder: false, label: 'Group areas' }),
        groups.map(g => { const k = M.count(g.items); return { name: g.name, sub: k.Open + ' open · ' + k.Scheduled + ' scheduled · ' + k.Done + ' done', pill: Kit.pill(g.items.length + ' requests', 'grey'), pick: () => { view.area = g.name; ctx.update(); } }; }), 'No requests yet.'), mapCard),
      h('div', { class: 'onelist' }, Kit.list(view.area || 'Site requests', null, selected.map(r => M.row(r, ctx)), 'No matching requests.'))];
  };
})();
