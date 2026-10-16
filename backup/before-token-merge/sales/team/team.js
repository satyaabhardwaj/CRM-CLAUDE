// Who reports to whom, and the "Viewing" dropdown in the top bar.
// An SM sees their own work and the work of the ASMs under them. Sample people for now.
(function () {
  const h = Kit.h;
  const TEAM = People.list;
  Sales.team = TEAM;
  Sales.me = TEAM[0];
  const below = TEAM.filter(function (p) { return p.reportsTo === Sales.me.id; });
  let who = 'me';

  Sales.addFilter({
    id: 'team',
    control: function (rerender) {
      const options = [['me', 'Me · ' + Sales.me.name + ' (' + Sales.me.role + ')']]
        .concat(below.map(function (p) { return [p.id, p.role + ' · ' + p.name]; }))
        .concat(below.length ? [['team', 'My whole team']] : []);
      return h('div', { style: 'width: 190px' }, Kit.select(options, who, function (v) { who = v; rerender(); }, { placeholder: false, label: 'Viewing' }));
    },
    test: function (c) {
      const owner = c.owner || Sales.me.id;
      if (who === 'team') return owner === Sales.me.id || below.some(function (p) { return p.id === owner; });
      return owner === (who === 'me' ? Sales.me.id : who);
    }
  });
})();
