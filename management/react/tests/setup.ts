import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import type { Client } from "../src/types";
export function install() {
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
  for (const file of ["runtime", "people", "rules", "signals"]) {
    vm.runInContext(
      readFileSync(resolve("../../shared/" + file + ".js"), "utf8"),
      context,
    );
    for (const name of ["Kit", "People", "SalesLogic", "Signals"])
      context[name] = (window as unknown as Record<string, unknown>)[name];
  }
  window.Kit.store.data = { rev: 1, clients: [] };
  return context;
}
export function client(id = "c1", extra: Record<string, unknown> = {}): Client {
  return window.SalesLogic.ensure({
    id,
    cid: "C-" + id,
    pid: "P-" + id,
    name: "Synthetic " + id,
    stage: "qualified",
    receivedAt: "2026-10-10T10:00:00Z",
    city: "Test city",
    product: "Kitchen",
    order: {
      products: [{ product: "Kitchen", value: 100000 }],
      bankPct: 100,
      faPct: 0,
    },
    payment: { plan: "SM", receipts: [] },
    ...extra,
  } as unknown as Client);
}
export function fixture() {
  const list = [
    "qualified",
    "design",
    "token",
    "booked",
    "post",
    "lost",
    "bin",
  ].map((stage, i) =>
    client("c" + i, {
      stage,
      owner: i % 2 ? "lang" : "tavneet",
      source: i % 2 ? "Web" : "Referral",
      psm: "Example PSM",
    }),
  );
  const c = list[1];
  c.design.step = "withClient";
  c.design.sentAt = "2026-10-11";
  c.design.stepAt = "2026-10-13";
  c.design.designer = "Example designer";
  c.design.proposals = [
    { v: 1, amount: 125000, receivedAt: "2026-10-12", sharedAt: "2026-10-13" },
  ];
  c.design.revisions = [{ reason: "Budget" }];
  for (const c of list.slice(2, 5)) {
    c.approvedAt = "2026-10-13";
    c.bookedAt = "2026-10-15";
    c.spokeAt = "2026-10-10T12:00:00Z";
    c.payment.receipts = [
      { amount: 20000, date: "2026-10-15", status: "Confirmed" },
      { amount: 30000, date: "2026-10-16", status: "Requested" },
    ];
  }
  list[3].nextFollowUp = "2026-10-16";
  return list;
}
export function legacy(context: Record<string, unknown>) {
  let source = readFileSync(resolve("../analysis.js"), "utf8");
  const prefix = source.slice(0, source.indexOf("  window.Analysis ="));
  const start = source.indexOf("      const all = mine.filter(inRange);"),
    end = source.indexOf("      return h('div', { class: 'mg' }", start);
  const body = source.slice(start, end);
  vm.runInContext(
    prefix +
      "window.referenceAnalysis=function(mine,range){view.range=range;" +
      body +
      "return {all,stages,reached,firstTalk,judged,kept,keptPct,toProposal,toYes,toToken,approved,revisionsPerApproval:approved.length?sum(approved,c=>c.design.revisions.length)/approved.length:null,due,got,left,cash,age,people,sources,psms,designers,reasons,totalRev};};})();",
    context,
  );
  source = readFileSync(resolve("../dashboard.js"), "utf8");
  vm.runInContext(
    source.slice(0, source.indexOf("  Kit.register('management'")) +
      "window.referenceStats=stats;window.referenceVerdict=verdict;})();",
    context,
  );
  return window as unknown as {
    referenceAnalysis: typeof import("../src/model").analysis;
    referenceStats: typeof import("../src/model").stats;
    referenceVerdict: typeof import("../src/model").verdict;
  };
}
