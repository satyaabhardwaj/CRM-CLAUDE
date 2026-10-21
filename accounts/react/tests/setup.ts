import { readFileSync } from "node:fs";
import vm from "node:vm";
import type { Client, Receipt } from "../src/model";
export function installRules() {
  const context: Record<string, unknown> = {
    window,
    document,
    console,
    Date,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    fetch: () =>
      Promise.reject(Error("Provider calls forbidden in rule tests")),
  };
  vm.createContext(context);
  for (const path of [
    "shared/runtime.js",
    "shared/people.js",
    "shared/rules.js",
    "accounts/common/pieces.js",
    "accounts/pi/pi.js",
    "accounts/common/master-columns.js",
  ]) {
    vm.runInContext(
      readFileSync(new URL("../../../" + path, import.meta.url), "utf8"),
      context,
    );
    Object.assign(context, {
      Kit: window.Kit,
      People: window.People,
      SalesLogic: window.SalesLogic,
      AccountsParts: window.AccountsParts,
    });
  }
  window.Kit.store.data = { rev: 0, clients: [] };
}
export function client(extra: Record<string, unknown> = {}): Client {
  return window.SalesLogic.ensure({
    id: "synthetic-a",
    pid: "P-9001",
    cid: "C-9001",
    name: "Synthetic client",
    stage: "booked",
    city: "Test City",
    product: "Kitchen",
    order: {
      products: [{ product: "Kitchen", value: 100000 }],
      bankPct: 100,
      faPct: 0,
    },
    payment: { plan: "SM", receipts: [] },
    gates: {},
    timeline: { type: "Standard", productionDays: 45, handover: "2026-12-31" },
    ...extra,
  } as unknown as Client);
}
export const payment = (amount = 59000, kind = "bank"): Receipt => ({
  amount,
  kind,
  date: "2026-10-19",
  mode: "Bank transfer",
  ref: "synthetic",
  status: "Confirmed",
});
