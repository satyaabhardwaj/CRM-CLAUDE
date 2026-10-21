// Every screen and state the audit visits. Selectors come from the current React markup (see README.md).
// A setup returns nothing on success, or throws `Unreachable` when the control is missing at this width.

export class Unreachable extends Error {
  constructor(message, blocked = false) {
    super(message);
    this.blocked = blocked; // present on the page but a person cannot click it
  }
}

const settle = (page, ms = 400) => page.waitForTimeout(ms);

async function click(page, locator, what) {
  const l = locator.first();
  if (!(await l.count())) throw new Unreachable(what + ' not found');
  if (!(await l.isVisible())) throw new Unreachable(what + ' not visible');
  try {
    await l.click({ timeout: 5000 });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Unreachable(what + ' is on the page but cannot be clicked (squeezed scroll area or covered)', true);
    throw e;
  }
  await settle(page);
}

// Opens the sidebar page by its visible label; below 1024 the sidebar is a drawer behind the header's menu button.
async function sidebar(page, name) {
  const item = page.locator('.crm-sidebar .crm-nav-item', { hasText: name });
  if (await item.first().isVisible().catch(() => false)) return click(page, item, 'sidebar ' + name);
  await click(page, page.locator('.app-menu'), 'menu button');
  await click(page, page.locator('dialog.crm-drawer[open] .crm-nav-item', { hasText: name }), 'drawer ' + name);
}

const userMenu = (page) => click(page, page.locator('summary[aria-label="User menu"]'), 'user menu');
const bell = (page) => click(page, page.locator('button.bell'), 'bell');
const firstRow = (page, sel, what) => click(page, page.locator(sel), what);

const common = (module, path) => [
  { id: `${module}/user-menu`, module, path, setup: userMenu, overlay: true },
  { id: `${module}/user-menu-settings`, module, path, overlay: true, setup: async (p) => {
    await userMenu(p);
    await click(p, p.getByRole('button', { name: 'Settings' }), 'Settings');
  } },
];

const sidebarStates = (module, path) => [
  { id: `${module}/sidebar-collapsed`, module, path, minWidth: 1024, setup: async (p) => {
    await click(p, p.locator('.crm-sidebar-toggle'), 'sidebar toggle');
  }, cleanup: async (p) => p.locator('.crm-sidebar-toggle').first().click().catch(() => {}) },
  { id: `${module}/sidebar-drawer`, module, path, maxWidth: 1023, overlay: true, setup: async (p) => {
    await click(p, p.locator('.app-menu'), 'menu button');
  } },
  // Only Sales and Design have a header search; below 1280 it opens from an icon.
  ...(['sales', 'design'].includes(module) ? [{ id: `${module}/search-open`, module, path, maxWidth: 1279, setup: async (p) => {
    // Between 768 and 1024 the search is already inline; that is the state to check.
    if (!(await p.locator('.app-search-toggle').isVisible()) && (await p.locator('.app-header-search input').isVisible())) return;
    await click(p, p.locator('.app-search-toggle'), 'search toggle');
  } }] : []),
];

const SALES_PAGES = [
  ['qualified', 'Qualified leads'], ['design', 'In design'], ['booked', 'Booked'], ['approvals', 'Sent for approvals'],
  ['team', 'My team'], ['payments', 'Payments'], ['tracker', 'Client tracker'], ['incentive', 'Incentive'],
  ['architects', 'Architects'], ['bin', 'Bin'],
];
const sales = [
  ...SALES_PAGES.map(([hash, name]) => ({ id: `sales/${hash}`, module: 'sales', path: `/sales/#${hash}`, page: true, refresh: true,
    tabFrom: hash === 'design' ? 'Qualified leads' : null, tabTo: name })),
  { id: 'sales/qualified-client', module: 'sales', path: '/sales/#qualified', overlay: true,
    setup: (p) => firstRow(p, '.sales-list-pick, main button.row', 'qualified client row') },
  { id: 'sales/design-client', module: 'sales', path: '/sales/#design', overlay: true,
    setup: (p) => firstRow(p, '.sales-list-pick, main button.row', 'design client row') },
  { id: 'sales/booked-client', module: 'sales', path: '/sales/#booked', overlay: true,
    setup: (p) => firstRow(p, '.sales-list-pick, main button.row', 'booked client row') },
  { id: 'sales/booked-client-edit', module: 'sales', path: '/sales/#booked', overlay: true, setup: async (p) => {
    await firstRow(p, '.sales-list-pick, main button.row', 'booked client row');
    await click(p, p.locator('dialog[open]').getByRole('button', { name: 'Edit anything' }), 'Edit anything');
  } },
  { id: 'sales/tracker-client', module: 'sales', path: '/sales/#tracker', overlay: true,
    setup: (p) => firstRow(p, 'main button.row, .sales-list-pick', 'tracker row') },
  { id: 'sales/new-opportunity', module: 'sales', path: '/sales/#qualified', overlay: true,
    setup: (p) => click(p, p.getByRole('button', { name: 'New opportunity' }), 'New opportunity') },
  { id: 'sales/bell', module: 'sales', path: '/sales/#qualified', overlay: true, setup: bell },
  { id: 'sales/also-today', module: 'sales', path: '/sales/#qualified', maxWidth: 1279,
    setup: (p) => click(p, p.locator('.sales-rail-toggle'), 'Also today') },
  { id: 'sales/eye-tile', module: 'sales', path: '/sales/#qualified',
    setup: (p) => click(p, p.locator('button.eye'), 'eye tile') },
  { id: 'sales/select-mode', module: 'sales', path: '/sales/#qualified',
    setup: (p) => click(p, p.getByRole('button', { name: 'Select', exact: true }), 'Select') },
  { id: 'sales/custom-dates', module: 'sales', path: '/sales/#qualified', setup: async (p) => {
    await p.getByLabel('Dates').first().selectOption({ label: 'Custom dates' });
    await settle(p);
  } },
  ...common('sales', '/sales/#qualified'),
  ...sidebarStates('sales', '/sales/#qualified'),
];

const DESIGN_PAGES = [
  ['today', null], ['pre/make', 'Proposals to make'], ['pre/timelines', 'Timelines'], ['pre/sales', 'With Sales'],
  ['pre/booking', 'Approved'], ['pre/all', 'All pre-design clients'], ['post/board', 'Post-design board'],
  ['post/pdi', 'PDI approval'], ['post/collections', 'Collections'], ['post/factory', 'Shoot to factory'], ['post/tracker', 'Order tracker'],
];
const design = [
  ...DESIGN_PAGES.map(([hash]) => ({ id: `design/${hash}`, module: 'design', path: `/design/#${hash}`, page: true, refresh: true })),
  { id: 'design/stage-tab-switch', module: 'design', path: '/design/#today', tabTo: 'Pre-design', tabRole: 'tab', page: true },
  { id: 'design/pre-client', module: 'design', path: '/design/#pre/all', overlay: true,
    setup: (p) => firstRow(p, 'button.design-list-row, button.design-client-pick', 'pre-design client row') },
  { id: 'design/post-client', module: 'design', path: '/design/#post/board', overlay: true,
    setup: (p) => firstRow(p, 'button.design-client-pick, button.design-tracker-grid', 'post-design client row') },
  { id: 'design/post-client-flow', module: 'design', path: '/design/#post/board', overlay: true, setup: async (p) => {
    await firstRow(p, 'button.design-client-pick, button.design-tracker-grid', 'post-design client row');
    await click(p, p.locator('dialog[open] .design-flow-button'), 'design flow button');
  } },
  { id: 'design/bell', module: 'design', path: '/design/#pre/make', overlay: true, setup: bell },
  { id: 'design/also-today', module: 'design', path: '/design/#pre/make', maxWidth: 1279,
    setup: (p) => click(p, p.locator('.design-rail-toggle'), 'Also today') },
  ...common('design', '/design/#pre/make'),
  ...sidebarStates('design', '/design/#pre/make'),
];

const measurement = [
  ...['overview', 'requests', 'areas', 'reports'].map((pg) => ({ id: `measurement/${pg}`, module: 'measurement',
    path: `/measurement/#all/${pg}`, page: true, refresh: pg !== 'areas', wait: pg === 'areas' ? '.m-map' : null })),
  { id: 'measurement/stage-tab-switch', module: 'measurement', path: '/measurement/#all/requests', tabTo: 'First Measurement', page: true },
  { id: 'measurement/details', module: 'measurement', path: '/measurement/#all/requests', overlay: true,
    setup: (p) => firstRow(p, 'table.m-table button[aria-label^="View"], button.react-row', 'request row') },
  { id: 'measurement/filters', module: 'measurement', path: '/measurement/#all/requests', overlay: true,
    setup: (p) => click(p, p.getByRole('button', { name: 'Filters' }), 'Filters') },
  { id: 'measurement/notifications', module: 'measurement', path: '/measurement/#all/overview', overlay: true, setup: bell },
  ...common('measurement', '/measurement/#all/overview'),
  ...sidebarStates('measurement', '/measurement/#all/requests'),
];

const ACCOUNTS_TABS = ['summary', 'clients', 'daily', 'approvals', 'booking', 'ept', 'drawing', 'pdi', 'handover', 'master'];
const accounts = [
  ...ACCOUNTS_TABS.map((t) => ({ id: `accounts/${t}`, module: 'accounts', path: `/accounts/#${t}`, page: true, refresh: true })),
  { id: 'accounts/tab-switch', module: 'accounts', path: '/accounts/#summary', tabTo: 'Clients', page: true },
  { id: 'accounts/payment-window', module: 'accounts', path: '/accounts/#clients', overlay: true,
    setup: (p) => firstRow(p, 'button.a-link', 'client name') },
  { id: 'accounts/booking-window', module: 'accounts', path: '/accounts/#booking', overlay: true,
    setup: (p) => firstRow(p, 'button.a-row, button.a-link', 'booking row') },
  { id: 'accounts/notifications', module: 'accounts', path: '/accounts/#summary', overlay: true, setup: bell },
  ...common('accounts', '/accounts/#summary'),
];

const management = [
  ...['overview', 'people', 'clients', 'analysis'].map((t) => ({ id: `management/${t}`, module: 'management',
    path: `/management/#${t}`, page: true, refresh: true })),
  { id: 'management/tab-switch', module: 'management', path: '/management/#overview', tabTo: 'Client wise', page: true },
  { id: 'management/person-selected', module: 'management', path: '/management/#overview', setup: async (p) => {
    const s = p.getByLabel('Person').first();
    const options = await s.locator('option').allTextContents();
    await s.selectOption({ label: options[1] });
    await settle(p);
  } },
  { id: 'management/client-detail', module: 'management', path: '/management/#clients', overlay: true,
    setup: (p) => firstRow(p, 'button.management-client-row, button.management-item', 'client row') },
  { id: 'management/person-detail', module: 'management', path: '/management/#people', overlay: true,
    setup: (p) => firstRow(p, 'button.management-people-row', 'person row') },
  ...common('management', '/management/#overview'),
];

const auth = [
  { id: 'auth/login', module: 'auth', path: '/login', loggedOut: true, page: true },
  { id: 'auth/login-error', module: 'auth', path: '/login', loggedOut: true, setup: async (p) => {
    await p.locator('#email').fill('nobody@qa.invalid');
    await p.locator('#password').fill('wrong-password-for-audit');
    await p.locator('#submit').click();
    await settle(p, 800);
  } },
  { id: 'auth/forgot-password', module: 'auth', path: '/forgot-password', loggedOut: true, page: true },
  { id: 'auth/reset-password', module: 'auth', path: '/reset-password', loggedOut: true, page: true },
  { id: 'auth/security', module: 'auth', path: '/security', page: true },
];

export const SCREENS = [...sales, ...design, ...measurement, ...accounts, ...management, ...auth];

// Landing pages for the empty/one datasets and the loading/error states.
export const DATA_STATE_SCREENS = SCREENS.filter((s) => s.page && !s.loggedOut && !s.tabTo && s.module !== 'auth');
