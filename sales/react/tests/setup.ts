import type { SalesClient } from "../src/model";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import type { Client, Context } from "../src/types";
export async function install() {
  const context: Record<string, unknown> = {
    window,
    document,
    console,
    Date,
    location,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    fetch: () =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ on: false }),
      }),
  };
  vm.createContext(context);
  const execute = (path: string) => {
    vm.runInContext(
      readFileSync(
        new URL("../../../" + path.replace(/^\//, ""), import.meta.url),
        "utf8",
      ),
      context,
    );
    for (const name of [
      "Kit",
      "People",
      "SalesLogic",
      "Signals",
      "Sales",
      "SalesPieces",
      "SalesCards",
      "SalesPanel",
      "SalesBin",
      "Architects",
      "WhatsApp",
      "OCF",
      "SalesLists",
      "QualifiedDropdowns",
      "InDesignDropdowns",
      "Pin",
    ])
      context[name] = (window as unknown as Record<string, unknown>)[name];
  };
  for (const file of [
    "shared/runtime.js",
    "shared/people.js",
    "shared/pin.js",
    "shared/rules.js",
    "shared/signals.js",
  ])
    execute(file);
  window.Kit.store.data = { rev: 1, clients: [] };
  return {};
}
export function client(
  id = "c1",
  extra: Record<string, unknown> = {},
): SalesClient {
  return window.SalesLogic.ensure({
    id,
    name: "Synthetic " + id,
    pid: "P-9001",
    cid: "C-9001",
    stage: "qualified",
    receivedAt: "2026-10-19T01:00:00Z",
    city: "Test city",
    phone: "0000000000",
    product: "Kitchen",
    order: {
      products: [{ product: "Kitchen", value: 100000 }],
      bankPct: 100,
      faPct: 0,
    },
    payment: { plan: "SM", receipts: [] },
    gates: {},
    ...extra,
  }) as SalesClient;
}
export function context(c: Client): Context {
  return {
    all: [c],
    everyone: [c],
    clients: [c],
    dash: c.stage,
    selected: c,
    isOpen: true,
    viewing: c.stage,
    match: () => true,
    add: () => {},
    whenSaved: async () => {},
    select: () => {},
    peek: () => {},
    close: () => {},
    update: (fn) => {
      fn?.();
    },
    goTo: () => {},
    open: () => {},
  };
}
