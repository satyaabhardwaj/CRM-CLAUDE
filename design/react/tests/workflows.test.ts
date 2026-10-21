// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { install, client } from "./setup";
import { rules } from "../src/model";
import {
  sendProposal,
  overwriteTimeline,
  recordEpt,
  addAppliance,
  applianceAction,
  designAction,
  approvePdi,
} from "../src/commands";
import { tasks, seen, pages, pdiWaiting, owed } from "../src/selectors";
import { factoryMessage, watchFactoryMail } from "../src/factory";
import { DesignStore, copy } from "../src/data";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve } from "node:path";
beforeAll(install);
afterEach(() => vi.unstubAllGlobals());
const proposal = () => {
  const c = client("proposal", { stage: "design" });
  c.design.step = "withDesign";
  return c;
};
const post = () => {
  const c = client("post", { stage: "post" });
  rules().flow(c);
  return c;
};
const ready = () => {
  const c = post(),
    f = rules().flow(c);
  c.measurement = {
    requestedAt: "2026-10-19",
    date: "2026-10-19",
    doneAt: "2026-10-19",
  };
  f.design.approvedAt = f.ept.signedAt = f.appliances.signedAt = "2026-10-19";
  return c;
};
it("preserves estimate, attachments, version and Sales handoff", () => {
  const c = proposal();
  c.design.promisedBy = "2026-10-20";
  sendProposal(c, {
    amount: "1,18,000",
    estimate: "estimate.pdf",
    design: "design.pdf",
    note: "Keep this",
  });
  expect(c.design.proposals[0]).toMatchObject({
    v: 1,
    amount: 118000,
    file: "estimate.pdf",
    designFile: "design.pdf",
    note: "Keep this",
    status: "To share",
  });
  expect(c.design.step).toBe("toShare");
  expect(c.design.promisedBy).toBe("");
  expect(() =>
    sendProposal(c, { amount: "1", estimate: "", design: "", note: "" }),
  ).toThrow("no longer");
});
it.each(["0", "-1", "NaN", "Infinity", ""])(
  "rejects invalid proposal %s without mutation",
  (amount) => {
    const c = proposal(),
      before = copy(c);
    expect(() =>
      sendProposal(c, { amount, estimate: "", design: "", note: "" }),
    ).toThrow("positive");
    expect(c).toEqual(before);
  },
);
it("records revision V2 without replacing V1", () => {
  const c = proposal();
  c.design.proposals = [{ v: 1, amount: 20, status: "Returned" }];
  sendProposal(c, { amount: "30", estimate: "", design: "", note: "Revision" });
  expect(c.design.proposals.map((p) => p.amount)).toEqual([20, 30]);
  expect(c.design.proposals[1].v).toBe(2);
});
it("retains timeline before/after audit with exact custom dates", () => {
  const c = client();
  c.timeline.handover = "2027-03-01";
  const before = rules().dates(c),
    after = {
      signoff: "2026-12-01",
      pdi: "2027-01-01",
      dispatch: "2027-02-01",
      handover: "2027-03-05",
    };
  overwriteTimeline(c, after);
  expect(c.timelineChanges![0]).toMatchObject({ before, after, by: "Design" });
  expect(rules().dates(c)).toEqual(after);
  expect(c.approvals.timeline).toBe("Overwritten");
});
it("rejects incomplete timeline", () => {
  const c = client();
  c.timeline.handover = "2027-03-01";
  expect(() =>
    overwriteTimeline(c, { signoff: "", pdi: "", dispatch: "", handover: "" }),
  ).toThrow("four");
  expect(c.timelineChanges).toBeUndefined();
});
it("measurement request remains idempotent and retains its note", () => {
  const c = post();
  rules().sendMeasurement(c, "Design");
  c.measurement!.note = "Keep";
  const before = copy(c.measurement);
  rules().sendMeasurement(c, "Design");
  expect(c.measurement).toEqual(before);
});
it("counts EPT sends and returns; a return revokes signoff", () => {
  const c = post();
  recordEpt(c, "Client signed the EPT", "");
  recordEpt(c, "Client asked for changes", "Change width");
  expect(rules().flow(c).ept.signedAt).toBe("");
  expect(rules().flowState(c).ept.returned).toBe(1);
  expect(rules().flow(c).ept.log.at(-1)?.note).toBe("Change width");
});
it("rejects invalid EPT state", () =>
  expect(() => recordEpt(post(), "Unknown", "")).toThrow("Choose"));
it("appliances require items to send/sign and edits revoke signoff", () => {
  const c = post();
  expect(() => applianceAction(c, "sign")).toThrow("Add");
  addAppliance(c, " Hob ", " Brand ", " Note ");
  applianceAction(c, "send");
  applianceAction(c, "sign");
  expect(rules().flow(c).appliances.signedAt).toBeTruthy();
  addAppliance(c, "Oven", "", "");
  expect(rules().flow(c).appliances.signedAt).toBe("");
  applianceAction(c, "return", "Change");
  expect(rules().flowState(c).appliances.returned).toBe(1);
});
it("requires measurement for final design and Accounts for drawing signoff", () => {
  const c = post();
  expect(() => designAction(c, "approve")).toThrow("measurement");
  expect(() => designAction(c, "signed")).toThrow("Accounts");
  rules().flow(c).ept.step = "legacy recorded";
  designAction(c, "approve");
  expect(rules().flow(c).design.approvedAt).toBeTruthy();
  c.gates = { drawing: { at: "2026-10-19" } };
  designAction(c, "signed");
  expect(c.drawingSignedAt).toBeTruthy();
  designAction(c, "return", "Change");
  expect(rules().flow(c).design.approvedAt).toBe("");
});
it("PDI requires all prerequisites; payment alone cannot bypass Accounts", () => {
  expect(() => approvePdi(post())).toThrow("all be done");
  const c = ready();
  c.payment.receipts = [
    { amount: 118000, date: "2026-10-19", status: "Confirmed" },
  ];
  approvePdi(c);
  expect(c.factoryAt).toBeUndefined();
  expect(rules().flow(c).pdi.approvedAt).toBeTruthy();
  const log = copy(rules().flow(c).pdi.log);
  approvePdi(c);
  expect(rules().flow(c).pdi.log).toEqual(log);
});
it("PDI factory transition requires 80% and queues email without sending", () => {
  const c = ready();
  c.gates = { factory: { at: "2026-10-19" } };
  c.payment.receipts = [
    { amount: 94400, date: "2026-10-19", status: "Confirmed" },
  ];
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  approvePdi(c);
  expect(c.factoryAt).toBeTruthy();
  expect(c.factoryMail?.state).toBe("queued");
  expect(send).not.toHaveBeenCalled();
  expect(factoryMessage(c)).toMatchObject({
    kind: "factory",
    subject: "Order shot to Factory: Synthetic post (P-9001)",
  });
});
it("pending receipts do not reduce collection due", () => {
  const c = post(),
    before = owed(c);
  c.payment.receipts = [
    { amount: 118000, date: "2026-10-19", status: "Pending" },
  ];
  expect(owed(c)).toBe(before);
  expect(rules().collectionDone(c)).toBe(false);
});
it("matches legacy task ordering, descriptions and filters", () => {
  const old: Record<string, any> = {
    window: {},
    Kit: window.Kit,
    People: window.People,
    SalesLogic: window.SalesLogic,
    Date,
  };
  vm.createContext(old);
  vm.runInContext(readFileSync(resolve("../common/pieces.js"), "utf8"), old);
  const D = old.window.DesignParts;
  const a = proposal(),
    b = ready(),
    c = post();
  approvePdi(b);
  const all = [a, b, c];
  expect(tasks(all)).toEqual(D.tasks(all));
  D.state.find = "SYNTHETIC proposal";
  expect(seen(all, "", "SYNTHETIC proposal", "all")).toEqual(D.seen(all));
  expect(pdiWaiting(all)).toEqual([]);
  expect(pages("pre", all).find((p) => p.id === "make")?.count).toBe(1);
});
it("factory worker waits for confirmed claim and never sends on failed save", async () => {
  const c = ready();
  c.factoryAt = "2026-10-19";
  c.factoryMail = { state: "queued" };
  let data = { rev: 1, clients: [c] };
  const send = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/me") return new Response('{"role":"admin"}');
    if (url === "/api/store" && init?.method === "PUT")
      return new Response("{}", { status: 503 });
    if (url === "/api/store") return new Response(JSON.stringify(data));
    throw Error("Unexpected external request");
  });
  vi.stubGlobal("fetch", send);
  const store = new DesignStore();
  await store.load();
  const stop = watchFactoryMail(store);
  await vi.waitFor(() => expect(store.state.error).toBeTruthy());
  expect(send.mock.calls.some(([url]) => url === "/api/mail/send")).toBe(false);
  stop();
});
it("prepared factory sender claims persistently before one mocked delivery", async () => {
  const c = ready();
  c.factoryAt = "2026-10-19";
  c.factoryMail = { state: "queued" };
  let data = { rev: 1, clients: [c] };
  let sends = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") return new Response('{"role":"admin"}');
      if (url === "/api/store" && init?.method === "PUT") {
        data = JSON.parse(String(init.body));
        data.rev++;
        return new Response(JSON.stringify({ rev: data.rev }));
      }
      if (url === "/api/store") return new Response(JSON.stringify(data));
      if (url === "/api/mail/send") {
        expect(data.clients[0].factoryMail?.state).toBe("sending");
        sends++;
        return new Response('{"sent":true,"test":true}');
      }
      throw Error("Unexpected request");
    }),
  );
  const store = new DesignStore();
  await store.load();
  const stop = watchFactoryMail(store);
  await vi.waitFor(() =>
    expect(data.clients[0].factoryMail?.state).toBe("sent"),
  );
  expect(sends).toBe(1);
  stop();
});
