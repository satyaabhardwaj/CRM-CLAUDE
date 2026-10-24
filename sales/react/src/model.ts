import type { Client, Context } from "./types";
export interface Receipt {
  amount: number;
  date: string;
  mode?: string;
  ref?: string;
  proof?: string;
  kind?: string;
  billing?: string;
  status: string;
  requestedAt?: string;
  decidedAt?: string;
  reason?: string;
  notes?: string;
  remarks?: string;
}
export interface EstimatePlan {
  kitchen: number;
  installation: number;
  transport: number;
  visits: number | null;
  visitRate: number | null;
}
export interface SpecialApproval {
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
  reason?: string;
  /** The date Sales asks Measurement for (the visit's given date). */
  date?: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
}
export interface Proposal {
  v: number;
  amount: number;
  status: string;
  receivedAt?: string;
  sharedAt?: string;
  approvedAt?: string;
  file?: string;
  designFile?: string;
  note?: string;
  /** The designer's estimate plan, line by line (23 Oct 2026); fills the order when the client approves. */
  plan?: EstimatePlan;
}
export interface Revision {
  ofVersion: number;
  at: string;
  reason: string;
  by: string;
  notes: string;
  file: string;
}
export interface Contact {
  at: string;
  type: string;
  outcome: string;
  note: string;
  next: string;
}
export interface Billing {
  id: string;
  name: string;
  gst?: string;
  pan?: string;
  phone?: string;
  email?: string;
  state?: string;
  address?: string;
  pin?: string;
  sameAsSite?: boolean;
}
export interface Architect {
  archived?: boolean;
  id: string;
  name: string;
  firm: string;
  phone: string;
  rate: number;
}
export interface Dates {
  signoff: string;
  pdi: string;
  dispatch: string;
  handover: string;
}
export interface SalesClient extends Client {
  product?: string;
  source?: string;
  segment?: string;
  priority?: string;
  trust?: string;
  budget?: string;
  siteType?: string;
  note?: string;
  psm?: string;
  sm?: string;
  person?: string;
  email?: string;
  receivedAt: string;
  spokeAt?: string;
  acceptedAt?: string;
  approvedAt?: string;
  bookedAt?: string;
  movedAt?: string;
  lostAt?: string;
  lostReason?: string;
  nextFollowUp?: string;
  retry?: { tries: number; dueAt: string } | null;
  validation: Record<string, string>;
  docs: Record<string, string>;
  contacts: Contact[];
  billing: Billing[];
  billingPick: string;
  people?: { name: string; relation: string; phone: string; email?: string }[];
  siteAddress?: string;
  sitePin?: string;
  siteState?: string;
  siteContact?: string;
  multi?: boolean;
  oneContact?: boolean;
  groupId?: string;
  orderName?: string;
  architectInvolved?: boolean;
  architectId?: string;
  order: {
    products: { product: string; value: number }[];
    installation?: number;
    /** Freight from the estimate (rupees); "freight" is the old name of the free accessories amount. */
    transport?: number;
    bankPct?: number | null;
    faPct?: number | null;
    md?: number;
    freight?: number;
    type?: string;
    architectCode?: string;
    archPct?: number;
  };
  payment: {
    plan: string;
    receipts: Receipt[];
    expectedBy?: string;
    tokenPlan?: number;
    tokenBy?: string;
  };
  timeline: {
    type: string;
    productionDays: number | string;
    handover?: string;
    custom: Partial<Dates>;
  };
  timelineChanges?: { at: string; by: string; before: Dates; after: Dates }[];
  approvals: Record<string, string>;
  approvalNotes?: Record<string, { reason: string; notes?: string }>;
  submittedAt?: string;
  measurement?: { requestedAt: string; date: string; by?: string };
  /** Site details for Measurement (24 Oct 2026): filled by Sales or the designer; Measurement can ask for them. */
  site?: {
    location?: string;
    supervisor?: string;
    supervisorPhone?: string;
    clientPhone?: string;
  };
  siteAsk?: { at: string; by: string; missing: string[] };
  /** Special approvals (23 Oct 2026): first site measurement before the token, decided by the AVP (Tavneet). */
  special?: { siteMeasurement?: SpecialApproval };
  visitBudget?: { visits: number | null; rate: number | null };
  design: {
    step?: string;
    stepAt?: string;
    sentAt?: string;
    designer?: string;
    promisedBy?: string;
    newProposal?: boolean;
    architectOk?: boolean;
    brief: {
      kitchenType: string[];
      presentation?: string;
      theme?: string;
      ceilingHeight?: string;
      kitchenHeight?: string;
      island?: string;
      gas?: string;
      vastu?: string;
      requiredOn?: string;
      room?: string;
      sqft?: string;
      notes?: string;
    };
    proposals: Proposal[];
    revisions: Revision[];
  };
  news?: { at: string; text: string; tone: string; from?: string }[];
  binned?: { at: string; stage: string };
  binnedCall?: {
    at: string;
    nextFollowUp: string;
    retry: SalesClient["retry"];
  };
  recordingText?: string;
  ocfAt?: string;
  ocfAsked?: boolean;
  ocfSignTried?: string;
  ocfSignProblem?: string;
  ocfSign?: {
    id: string;
    status: string;
    sentAt: string;
    to?: string[];
    test: boolean;
    filename: string;
    auto?: boolean;
    file?: string;
    signedAt?: string;
    checkedAt?: string;
    people?: { name: string; status: string }[];
  };
}
export interface FormProps {
  c: SalesClient;
  ctx: Context;
}
export interface Totals {
  products: number;
  base: number;
  bankBase: number;
  tax: number;
  bank: number;
  md: number;
  freight: number;
  mgmt: number;
  bankPct: number | null;
  faPct: number | null;
  success: number;
  afterSuccess: number;
  total: number;
  gross: number;
  net: number;
}
export interface Rules {
  ensure(c: Client): SalesClient;
  totals(c: Client): Totals;
  dates(c: Client): Dates | null;
  PLANS: Record<
    string,
    { label: string; approver: string; shares: [string, number][] }
  >;
  STAGES: [string, string][];
  shares(c: Client): { name: string; percent: number; amount: number }[];
  bookingDue(c: Client): number;
  bookingLeft(c: Client): number;
  collected(c: Client): number;
  tokenIn(c: Client): boolean;
  atStake(c: Client): number;
  payDue(c: Client): string;
  firstCall(c: Client): { done: boolean; hoursLeft: number; late: boolean };
  clock(c: Client): [string, string];
  lastSpoke(c: Client): string | null;
  logContact(c: Client, entry: Omit<Contact, "at">): void;
  ledger(c: Client): {
    name: string;
    percent: number;
    amount: number;
    paid: number;
    due: number;
  }[];
}
export const rules = () => window.SalesLogic as Rules;
export const clients = (list: Client[]) => list as SalesClient[];
export const architects = () =>
  (window.Kit.store.data.architects || []) as Architect[];
export function assignArchitect(c: SalesClient, id: string, on = true) {
  const a = on ? architects().find((a) => a.id === id) : undefined;
  c.architectInvolved = on;
  c.architectId = a?.id || "";
  c.order.architectCode = a?.name || "";
  c.order.archPct = Number(a?.rate) || 0;
}
export function related(c: SalesClient, ctx: Context) {
  return c.groupId
    ? clients(ctx.everyone).filter(
        (x) => x.groupId === c.groupId && x.stage !== "bin",
      )
    : [c];
}
export function nextBillingId(c: SalesClient) {
  return (
    "B-" +
    c.cid.replace("C-", "") +
    "-" +
    (Math.max(0, ...c.billing.map((b) => Number(b.id.split("-").pop()) || 0)) +
      1)
  );
}
export function binClient(c: SalesClient) {
  c.binned = { at: new Date().toISOString(), stage: c.stage };
  c.stage = "bin";
}
