export interface Receipt {
  amount: number;
  date: string;
  mode: string;
  ref: string;
  kind: string;
  billing?: string;
  status: string;
  requestedAt?: string;
  decidedAt?: string;
  reason?: string;
  notes?: string;
  proof?: string;
  by?: string;
  operationId?: string;
}
export interface Client {
  [key: string]: unknown;
  id: string;
  name: string;
  pid: string;
  cid: string;
  stage: string;
  city: string;
  product: string;
  sm?: string;
  bookedAt?: string;
  submittedAt?: string;
  factoryAt?: string;
  ocfReceived?: boolean;
  order: {
    products: { product: string; value: number }[];
    installation?: number;
    type?: string;
    bankPct?: number | string;
    faPct?: number | string;
    md?: number;
    freight?: number;
    archPct?: number;
    [key: string]: unknown;
  };
  payment: {
    plan: string;
    receipts: Receipt[];
    tokenPlan?: number;
    tokenBy?: string;
    expectedBy?: string;
    [key: string]: unknown;
  };
  billing: {
    id: string;
    name: string;
    gst?: string;
    pan?: string;
    address?: string;
    pin?: string;
    sameAsSite?: boolean;
  }[];
  billingPick: string;
  approvals: {
    booking: string;
    plan: string;
    timeline: string;
    [key: string]: unknown;
  };
  approvalNotes?: Record<string, { reason: string; notes: string; at: string }>;
  gates: Record<string, { at: string; by: string }>;
  docs: Record<string, string>;
  design: { designer?: string; [key: string]: unknown };
  news?: { at: string; text: string; from?: string; tone?: string }[];
  pis?: { at: string; stage: string; pct: number; net: number; no: string }[];
  accountsOperations?: string[];
  factoryMail?: {
    state: string;
    why?: string;
    to?: string;
    at?: string;
    test?: boolean;
  };
}
export interface Store {
  [key: string]: unknown;
  rev: number;
  clients: Client[];
  seen?: Record<string, { at: string }>;
}
export interface Totals {
  base: number;
  total: number;
  bank: number;
  bankBase: number;
  tax: number;
  md: number;
  mgmt: number;
  freight: number;
  bankPct: number | null;
  faPct: number | null;
}
export interface Ledger {
  name: string;
  percent: number;
  amount: number;
  paid: number;
  due: number;
}
export interface Gate {
  key: string;
  pct: number;
  need: number;
  got: number;
  short: number;
  approved: { at: string; by: string } | null;
  ready: boolean;
}
export interface Rules {
  ensure(c: Client): Client;
  totals(c: Client): Totals;
  received(c: Client): { bank: number; md: number };
  collected(c: Client): number;
  bookingDue(c: Client): number;
  bookingLeft(c: Client): number;
  tokenIn(c: Client): boolean;
  payDue(c: Client): string;
  ledger(c: Client): Ledger[];
  shares(c: Client): Ledger[];
  dates(c: Client): {
    signoff: string;
    pdi: string;
    dispatch: string;
    handover: string;
  } | null;
  gate(c: Client, key: string): Gate;
  gatePct(c: Client, key: string): number;
  gateOpen(c: Client, key: string): boolean;
  handed(c: Client): boolean;
  collectionDone(c: Client): boolean;
  flow(c: Client): Record<string, { approvedAt?: string; signedAt?: string }>;
  GATES: [string, string][];
  PLANS: Record<string, { label: string; shares: [string, number][] }>;
}
export interface Pi {
  pct: number;
  bank: number;
  bankBase: number;
  gst: number;
  due: number;
  got: number;
  net: number;
  netBase: number;
  netGst: number;
}
declare global {
  interface Window {
    SalesLogic: Rules;
    People: { owner(c: Client): string };
    AccountsParts: {
      piMaths(c: Client, key: string): Pi;
      piDownload(c: Client, key: string, name: string): void;
    };
    AccountsMasterColumns: [string, (c: Client) => unknown][];
    CRM_BANK_ONLY?: boolean;
    jspdf?: unknown;
    Kit: {
      store: { data: Store | null };
      money(n: number): string;
      lakh(n: number): string;
      short(n: number): string;
      day(v: string): string;
      dayTime(v: string): string;
      today(): string;
      now(): string;
      news(c: Client, text: string, tone: string, from: string): void;
    };
  }
}
export const L = () => window.SalesLogic;
export const K = () => window.Kit;
export const bankOnly = () => !!window.CRM_BANK_ONLY;
export const owner = (c: Client) => window.People.owner(c);
export const STAGES = [
  ["booking", "Booking", "Booking"],
  ["ept", "EPT", "EPT"],
  ["drawing", "Production drawing", "Production"],
  ["pdi", "PDI", "PDI"],
  ["handover", "Handover", "EHOD"],
];
export const MODES = [
  "Bank transfer",
  "UPI",
  "Cheque",
  "Cash",
  "Pickup needed",
];
export const inPlay = (c: Client) =>
  ["token", "booked", "post"].includes(c.stage);
export const hasOrder = (c: Client) =>
  inPlay(c) && c.order.products.length > 0 && L().totals(c).total > 0;
export function normalize(store: Store) {
  const copy = structuredClone(store);
  copy.clients.forEach((c) => L().ensure(c));
  K().store.data = copy;
  return copy;
}
export function money(c: Client) {
  const t = L().totals(c),
    got = L().received(c),
    paid = L().collected(c);
  return {
    t,
    paid,
    bankGot: got.bank,
    mgmtGot: got.md,
    bankDue: Math.max(0, t.bank - got.bank),
    mgmtDue: Math.max(0, t.mgmt - got.md),
    balance: Math.max(0, t.total - paid),
    pct: t.total ? (paid / t.total) * 100 : 0,
  };
}
export const pct = (n: number) => (Math.floor(n * 100) / 100).toFixed(2) + "%";
export const team = (c: Client) => (money(c).pct < 50 ? "Sales" : "Design");
export function nextGate(c: Client) {
  for (const [key, label] of L().GATES) {
    const g = L().gate(c, key);
    if (!g.approved) return { ...g, label };
  }
  return null;
}
export function nextLine(c: Client) {
  const g = nextGate(c);
  if (!g) return "All approvals done";
  if (g.ready) return `${g.label} · ${g.pct}% in · ready to approve`;
  if (g.short) return `${g.label} · ${K().short(g.short)} more for ${g.pct}%`;
  return `${g.label} · ${g.pct}% in · ${g.key === "factory" ? "waiting for the PDI" : "waiting for the earlier step"}`;
}
export function bookOf(c: Client) {
  if (["lost", "bin"].includes(c.stage) && c.bookedAt) return "Cancelled";
  if (!inPlay(c)) return "";
  if (L().gateOpen(c, "dispatch")) return "Dispatched";
  if (c.factoryAt) return "In production";
  if (L().handed(c)) return "With Design";
  return c.ocfReceived ? "Booked · OCF in" : "OCF pending";
}
export function line(c: Client, share: string) {
  const rows = L().ledger(c),
    i = rows.findIndex((r) => r.name === share);
  if (i < 0) return null;
  const d = L().dates(c);
  return {
    ...rows[i],
    now: rows.slice(0, i).every((r) => r.due === 0) && rows[i].due > 0,
    done: rows[i].due === 0 && rows[i].amount > 0,
    by:
      share === "Booking"
        ? L().payDue(c)
        : d
          ? (
              { Production: d.signoff, PDI: d.pdi, EHOD: d.handover } as Record<
                string,
                string
              >
            )[share] || ""
          : "",
  };
}
export function billing(c: Client) {
  const b = c.billing.find((b) => b.id === c.billingPick) || c.billing[0];
  return b
    ? `${b.name} · ${b.id}${b.gst ? " · GST " + b.gst : ""}${b.pan ? " · PAN " + b.pan : ""} · ${b.sameAsSite ? c.siteAddress || "" : (b.address || "") + " " + (b.pin || "")}`
    : "Not given";
}
export function validation(d: Pick<Receipt, "amount" | "date" | "mode">) {
  if (!Number.isFinite(d.amount) || d.amount <= 0)
    return "Enter an amount greater than zero.";
  const date = new Date(d.date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d.date) ||
    !Number.isFinite(+date) ||
    date.toISOString().slice(0, 10) !== d.date
  )
    return "Enter a valid date received.";
  if (!MODES.includes(d.mode)) return "Choose how it was paid.";
  return "";
}
export function record(c: Client, d: Receipt) {
  if (!inPlay(c)) throw Error("This client is no longer active.");
  const error = validation(d);
  if (error) throw Error(error);
  if (!["bank", "md"].includes(d.kind))
    throw Error("Choose where the payment goes.");
  if (d.billing && !c.billing.some((b) => b.id === d.billing))
    throw Error("Billing name changed. Reload the client.");
  c.payment.receipts.push({
    ...d,
    billing: d.billing || c.billingPick,
    status: "Confirmed",
    decidedAt: K().now(),
    by: "Accounts",
  });
  if (c.stage === "token") {
    c.stage = "booked";
    c.bookedAt = K().now();
  }
  K().news(
    c,
    "Accounts received " +
      K().money(d.amount) +
      (d.kind === "md" ? " (management)" : " (bank)"),
    "green",
    "Accounts",
  );
}
export function decide(
  c: Client,
  kind: "booking" | "payment",
  approved: boolean,
  reason: string,
  notes: string,
  at?: string,
) {
  if (!inPlay(c)) throw Error("This client is no longer active.");
  if (!approved && !["Not Received", "Information Incomplete"].includes(reason))
    throw Error("Choose the rejection reason.");
  if (kind === "booking") {
    if (c.approvals.booking !== "Pending")
      throw Error(
        "This booking has already been decided. Refresh to see the decision.",
      );
    c.approvals.booking = approved ? "Approved" : "Rejected";
    c.approvalNotes = {
      ...c.approvalNotes,
      booking: {
        reason: approved ? "" : reason,
        notes: approved ? "" : notes,
        at: K().now(),
      },
    };
    K().news(
      c,
      "Accounts " +
        (approved ? "approved the booking" : "rejected the booking: " + reason),
      approved ? "green" : "red",
      "Accounts",
    );
  } else {
    const r = c.payment.receipts.find(
      (r) => r.requestedAt === at && r.status === "Requested",
    );
    if (!r)
      throw Error(
        "This receipt has already been decided. Refresh to see the decision.",
      );
    r.status = approved ? "Confirmed" : "Rejected";
    r.decidedAt = K().now();
    if (!approved) {
      r.reason = reason;
      r.notes = notes;
    }
    if (approved && c.stage === "token") {
      c.stage = "booked";
      c.bookedAt = K().now();
    }
    K().news(
      c,
      "Accounts " +
        (approved ? "confirmed " : "rejected ") +
        K().money(r.amount) +
        (approved ? "" : ": " + reason),
      approved ? "green" : "red",
      "Accounts",
    );
  }
}
// Deliberately pure before the compare-and-swap save; mail is dispatched only after persistence.
export function approve(c: Client, key: string) {
  if (!hasOrder(c) || !L().gate(c, key).ready)
    throw Error(
      "This approval is no longer ready. Refresh and review the latest balance.",
    );
  c.gates[key] = { at: K().now(), by: "Accounts" };
  K().news(
    c,
    "Accounts approved: " + L().GATES.find((g) => g[0] === key)![1],
    "green",
    "Accounts",
  );
  if (
    key === "factory" &&
    !c.factoryAt &&
    L().flow(c).pdi.approvedAt &&
    L().handed(c) &&
    L().collectionDone(c)
  ) {
    c.factoryAt = K().now();
    c.factoryMail = { state: "pending" };
    K().news(
      c,
      "PDI approved, 80% in and Accounts go-ahead · order shot to the Factory",
      "green",
      "Accounts",
    );
  }
}
export function csv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' +
              String(value ?? "")
                .replace(/^[=+@\-\t\r]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
export function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
