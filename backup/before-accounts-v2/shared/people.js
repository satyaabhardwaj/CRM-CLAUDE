// The people in the company, and who reports to whom. Real names from Manish. Real logins replace this later.
//
//   Tavneet · AVP
//     Anushka · ASM      Vaishnavi · ASM
//     Arjun · SM         Lang · SM
//     Siddharth · ASM    Rahul · ASM
//
// Everyone reports straight to Tavneet. An ASM is not under an SM.
// The AVP can change a person between ASM and SM on her own screen (Sales, My team). That choice is saved with
// the data, and `role` below always gives the role in force now.
(function () {
  const BASE = [
    { id: 'tavneet', name: 'Tavneet', role: 'AVP', reportsTo: '' },
    { id: 'anushka', name: 'Anushka', role: 'ASM', reportsTo: 'tavneet' },
    { id: 'vaishnavi', name: 'Vaishnavi', role: 'ASM', reportsTo: 'tavneet' },
    { id: 'arjun', name: 'Arjun', role: 'SM', reportsTo: 'tavneet' },
    { id: 'lang', name: 'Lang', role: 'SM', reportsTo: 'tavneet' },
    { id: 'siddharth', name: 'Siddharth', role: 'ASM', reportsTo: 'tavneet' },
    { id: 'rahul', name: 'Rahul', role: 'ASM', reportsTo: 'tavneet' }
  ];
  const list = BASE.map(function (b) {
    const p = { id: b.id, name: b.name, reportsTo: b.reportsTo, startedAs: b.role };
    Object.defineProperty(p, 'role', { enumerable: true, get: function () {
      const saved = window.Kit && Kit.store && Kit.store.data && Kit.store.data.people ? Kit.store.data.people[b.id] : null;
      return saved && saved.role ? saved.role : b.role;
    } });
    return p;
  });
  window.People = {
    list: list,
    // Roles the AVP can move a person between.
    ROLES: ['ASM', 'SM'],
    // The head of Design. He sees every designer's work, and every designer can see everyone else's too.
    designHead: 'Sachin',
    // Designers a sales person can allot a client to. Real names from the company sheet.
    designers: ["Ankita", "Atif", "Deepanksha", "Gunjan", "Jyoti", "Mansi", "Mehul", "Nidhi", "Rashi", "Rishabh", "Rupa", "Soma", "Sudha", "Vishal"],
    // The sales person a client belongs to, as "AVP Tavneet".
    owner: function (c) {
      const p = list.find(function (x) { return x.id === (c.owner || list[0].id); });
      return p ? p.role + ' ' + p.name : 'Sales';
    }
  };
})();
