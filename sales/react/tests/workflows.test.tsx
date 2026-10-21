// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { install, client, context } from "./setup";
import {
  acceptLead,
  approveDesign,
  disqualify,
  handOver,
  missingBrief,
  requestPayment,
  reviseDesign,
  sendBrief,
  submitBooking,
} from "../src/commands";
import { rules, binClient } from "../src/model";
import { OrderForm, PaymentForm, ApprovalForm } from "../src/OrderForms";
import { QualifiedForm } from "../src/QualifiedForm";
import { DesignForm } from "../src/DesignForm";
import { additionalOrder, BillingPicker } from "../src/PersonalForm";
import { Field } from "../src/ui";
let root: Root | undefined, host: HTMLDivElement;
beforeAll(async () => {
  await install();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
async function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(() => root!.render(node));
  return host;
}
async function click(label: string) {
  const b = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  expect(b).toBeTruthy();
  await act(() => b!.click());
}
async function input(label: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(
    '[aria-label="' + label + '"]',
  )!;
  expect(el).toBeTruthy();
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("requires a real conversation and accepts related qualified orders together", () => {
  const c = client(),
    ctx = context(c);
  expect(() => acceptLead({ c, ctx })).toThrow("Speak");
  c.spokeAt = "2026-10-19";
  c.groupId = "g";
  const other = client("other", { groupId: "g" });
  ctx.everyone.push(other);
  c.validation.theme = "Modern PG1";
  c.validation.kitchenType = "Chef";
  acceptLead({ c, ctx });
  expect([c.stage, other.stage]).toEqual(["design", "design"]);
  expect(c.design.brief).toMatchObject({
    theme: "Modern PG1",
    kitchenType: ["Chef"],
  });
});
it("requires disqualification reason and preserves the record", () => {
  const c = client();
  expect(() => disqualify(c, " ")).toThrow("reason");
  disqualify(c, " Not buying ");
  expect(c.stage).toBe("lost");
  expect(c.lostReason).toBe("Not buying");
  expect(c.order.products[0].value).toBe(100000);
});
it("requires complete DRF and designer before sending", () => {
  const c = client("drf", { stage: "design" });
  expect(() => sendBrief(c)).toThrow("Complete");
  c.design.brief = {
    kitchenType: ["Chef"],
    presentation: "Kitchen 3D",
    theme: "Modern PG1",
    ceilingHeight: "2800",
    kitchenHeight: "2500",
    island: "No",
    gas: "Piped Gas",
    vastu: "No",
    requiredOn: "2026-11-01",
    room: "Kitchen",
  };
  expect(missingBrief(c)).toEqual([]);
  expect(() => sendBrief(c)).toThrow("designer");
  c.design.designer = "Ankita";
  sendBrief(c);
  expect(c.design.step).toBe("withDesign");
  expect(c.news![0].text).toContain("DRF sent");
});
it("requires signed documents and architect approval, derives OBV once", () => {
  const c = client("approve", { stage: "design", architectInvolved: true });
  c.design.step = "withClient";
  c.design.proposals.push({ v: 1, amount: 118000, status: "With client" });
  c.order.products = [];
  expect(() => approveDesign(c)).toThrow("Signed");
  c.docs = { quotation: "q.pdf", drawing: "d.pdf" };
  expect(() => approveDesign(c)).toThrow("architect");
  c.design.architectOk = true;
  approveDesign(c);
  expect(c.stage).toBe("booked");
  expect(c.order.products).toEqual([{ product: "Kitchen", value: 100000 }]);
  expect(c.design.proposals[0].status).toBe("Approved");
});
it("records revision version, reason, attachments and returns to designer", () => {
  const c = client("revise", { stage: "design" });
  c.design.step = "withClient";
  c.design.proposals.push({ v: 2, amount: 100000, status: "With client" });
  expect(() =>
    reviseDesign(c, { reason: "", by: "", notes: "", file: "" }),
  ).toThrow("reason");
  reviseDesign(c, {
    reason: "Estimate Error",
    by: "Architect",
    notes: "Synthetic",
    file: "revision.pdf",
  });
  expect(c.design.step).toBe("withDesign");
  expect(c.design.revisions[0]).toMatchObject({
    ofVersion: 2,
    reason: "Estimate Error",
    by: "Architect",
    file: "revision.pdf",
  });
});
it("records requested payments without counting them as confirmed money", () => {
  const c = client("pay");
  expect(() =>
    requestPayment(c, { amount: -1, date: "", mode: "", proof: "" }),
  ).toThrow("positive");
  requestPayment(c, {
    amount: 59000,
    date: "2026-10-19",
    mode: "UPI",
    proof: "proof.pdf",
  });
  expect(rules().collected(c)).toBe(0);
  expect(c.payment.receipts[0]).toMatchObject({
    status: "Requested",
    billing: c.billingPick,
    kind: "bank",
    proof: "proof.pdf",
  });
});
it("retains financial rounding, plan shares and confirmed-only handover gate", () => {
  const c = client("booked", { stage: "booked" });
  expect(rules().totals(c).total).toBe(118000);
  expect(rules().bookingDue(c)).toBe(59000);
  expect(() => handOver(c)).toThrow("Collect");
  c.payment.receipts.push({
    amount: 59000,
    date: "2026-10-19",
    status: "Requested",
  });
  expect(() => handOver(c)).toThrow("Collect");
  c.payment.receipts[0].status = "Confirmed";
  handOver(c);
  expect(c.stage).toBe("post");
  for (const plan of ["SM", "AVP", "Founder"]) {
    c.payment.plan = plan;
    expect(
      rules()
        .shares(c)
        .reduce((n, s) => n + s.amount, 0),
    ).toBe(rules().totals(c).total);
  }
});
it("requires order value and timeline before booking submission", () => {
  const c = client();
  expect(() => submitBooking(c)).toThrow("handover");
  c.timeline.handover = "2027-01-01";
  c.approvals.booking = "Rejected";
  submitBooking(c);
  expect(c.approvals.booking).toBe("Pending");
  expect(c.submittedAt).toBeTruthy();
});
it("soft deletes without removing data", () => {
  const c = client();
  binClient(c);
  expect(c.stage).toBe("bin");
  expect(c.binned?.stage).toBe("qualified");
  expect(c.order.products).toHaveLength(1);
});
it("new related orders keep customer identity but never inherit paid money/signatures/gates", () => {
  const c = client("old", {
    multi: true,
    person: "Synthetic",
    groupId: "g",
    stage: "booked",
    ocfSign: { id: "signature" },
    ocfSignTried: "old",
    factoryAt: "old",
  });
  c.payment.receipts.push({
    amount: 999,
    date: "2026-10-19",
    status: "Confirmed",
  });
  const before = JSON.stringify(c),
    next = additionalOrder(
      c,
      "Second kitchen",
      "0000000000",
      "new",
      "layout.pdf",
    );
  expect(JSON.stringify(c)).toBe(before);
  expect(next).toMatchObject({
    cid: c.cid,
    pid: c.pid,
    groupId: "g",
    stage: "design",
    docs: { layout: "layout.pdf" },
  });
  expect(next.payment.receipts).toEqual([]);
  expect(next.ocfSign).toBeUndefined();
  expect(next.factoryAt).toBeUndefined();
  expect(next.order.products).toEqual([]);
});
it("React qualified validation stays visible without a DOM renderer", async () => {
  const c = client();
  await render(<QualifiedForm c={c} ctx={context(c)} />);
  await click("Accept and start DRF");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Speak");
  expect(c.stage).toBe("qualified");
  await click("Disqualify");
  expect(host.textContent).toContain("Write the reason");
});
it("React DRF submission is disabled while incomplete", async () => {
  const c = client("d", { stage: "design" });
  await render(<DesignForm c={c} ctx={context(c)} />);
  expect(
    [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Send DRF to designer",
    )!.disabled,
  ).toBe(true);
});
it("React order fields save only on blur or Enter and preserve unrelated order values", async () => {
  const c = client(),
    ctx = context(c),
    update = vi.fn(ctx.update);
  ctx.update = update;
  await render(<OrderForm c={c} ctx={ctx} />);
  await input("Kitchen value", "200000");
  expect(c.order.products[0].value).toBe(100000);
  await act(() =>
    host
      .querySelector('[aria-label="Kitchen value"]')!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
  );
  expect(c.order.products[0].value).toBe(200000);
  expect(c.order.bankPct).toBe(100);
  expect(update).toHaveBeenCalledTimes(1);
});
it("React payment form rejects invalid amount and keeps its draft", async () => {
  const c = client();
  await render(<PaymentForm c={c} ctx={context(c)} />);
  await click("Tell Accounts the client has paid");
  await input("Amount the client says (₹)", "-1");
  await click("Send to Accounts");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "positive",
  );
  expect(c.payment.receipts).toHaveLength(0);
  await input("Amount the client says (₹)", "59000");
  await click("Send to Accounts");
  expect(c.payment.receipts[0]).toMatchObject({
    amount: 59000,
    status: "Requested",
  });
});
it("billing names allocate from highest existing suffix, not array length", async () => {
  const c = client();
  c.billing.push({ id: "B-9001-9", name: "Another" });
  await render(<BillingPicker c={c} ctx={context(c)} />);
  await click("Add billing name");
  await input("New billing name", "Synthetic billing");
  await click("Add billing name");
  expect(c.billing.at(-1)?.id).toBe("B-9001-10");
  expect(c.billingPick).toBe("B-9001-10");
});
it("native approval form keeps submission gated", async () => {
  const c = client();
  await render(<ApprovalForm c={c} ctx={context(c)} />);
  expect(
    [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Submit booking",
    )!.disabled,
  ).toBe(true);
});
it("controlled text field retains focus and commits once across rerenders", async () => {
  const save = vi.fn();
  await render(<Field label="Test" value="old" onCommit={save} />);
  const el = host.querySelector("input")!;
  el.focus();
  await input("Test", "draft");
  await act(() =>
    root!.render(<Field label="Test" value="old" onCommit={save} />),
  );
  expect(document.activeElement).toBe(el);
  expect(el.value).toBe("draft");
  await act(() =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  await act(() =>
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(save).toHaveBeenCalledExactlyOnceWith("draft");
});
it("all native dashboards render empty and populated data without compatibility globals", async () => {
  const { routes } = await import("../src/Dashboards");
  expect(
    (window as unknown as Record<string, unknown>).SalesCards,
  ).toBeUndefined();
  const c = client(),
    ctx = context(c);
  for (const route of routes) {
    await render(
      <route.Component ctx={{ ...ctx, all: [], everyone: [], clients: [] }} />,
    );
    expect(host.textContent).toBeTruthy();
    await act(() => root!.unmount());
    root = undefined;
    await render(<route.Component ctx={ctx} />);
    expect(host.textContent).toBeTruthy();
    await act(() => root!.unmount());
    root = undefined;
  }
});

it("commits native date inputs once on blur and Enter", async () => {
  const commit = vi.fn();
  await render(
    <Field label="Delivery" type="date" value="" onCommit={commit} />,
  );
  await input("Delivery", "2026-12-31");
  const field = host.querySelector("input")!;
  await act(() =>
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  await act(() =>
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(commit).toHaveBeenCalledExactlyOnceWith("2026-12-31");
});

it("retains international and ten-digit WhatsApp numbers without dropping zeros", async () => {
  const { whatsappNumber } = await import("../src/WhatsApp");
  expect(whatsappNumber("0000000000")).toBe("910000000000");
  expect(whatsappNumber("+44 20 1234 5678")).toBe("442012345678");
  expect(whatsappNumber("")).toBe("");
});

it("keeps PDF report sections and financial values equivalent to the original service", async () => {
  const { readFileSync } = await import("node:fs");
  const vm = await import("node:vm");
  const source = readFileSync("../common/pieces.js", "utf8");
  const sandbox = {
    window: {},
    Kit: window.Kit,
    SalesLogic: window.SalesLogic,
    People: window.People,
  };
  vm.runInNewContext(source, sandbox);
  const original = (
    sandbox.window as unknown as {
      SalesPieces: { report(c: unknown): unknown };
    }
  ).SalesPieces;
  const { clientReport } = await import("../src/reports.js");
  for (const stage of ["qualified", "design", "booked", "post"]) {
    const c = client("pdf", { stage });
    expect(JSON.stringify(clientReport(c))).toBe(
      JSON.stringify(original.report(c)),
    );
  }
});

it("requires an email and a confirmed signature id without marking an uncertain send complete", async () => {
  const { signingBody, recordSignature, signRequest } =
    await import("../src/OcfForm");
  const c = client();
  expect(() => signingBody(c)).toThrow("email");
  expect(() => recordSignature(c, {}, "order.pdf")).toThrow("not confirmed");
  expect(c.ocfSign).toBeFalsy();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "no key" }),
    }),
  );
  await expect(signRequest("/api/sign/send", {})).rejects.toThrow(
    "not configured",
  );
});
