// The people in the company. The sales manager and the designers are the real names from the company sheet.
// Real logins replace this later.
window.People = {
  list: [
    { id: "tavneet", name: "Tavneet", role: 'AVP', reportsTo: '' },
    { id: "siddharth", name: "Siddharth", role: 'SM', reportsTo: 'tavneet' },
    { id: "lang", name: "Lang", role: 'SM', reportsTo: 'tavneet' }
  ],
  // Designers a sales person can allot a client to.
  designers: ["Ankita", "Atif", "Deepanksha", "Gunjan", "Jyoti", "Mansi", "Mehul", "Nidhi", "Rashi", "Rishabh", "Rupa", "Soma", "Sudha", "Vishal"],
  // The sales person a client belongs to, as "AVP Tavneet".
  owner: function (c) {
    const p = window.People.list.find(function (x) { return x.id === (c.owner || window.People.list[0].id); });
    return p ? p.role + ' ' + p.name : 'Sales';
  }
};
