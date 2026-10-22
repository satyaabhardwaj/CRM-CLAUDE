// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { installRules, client, payment } from "./setup";
import { PaymentForm, Gates } from "../src/payments";
import { Master, Summary } from "../src/pages";
import { L, decide, approve, type Client } from "../src/model";
import { readStore } from "../src/store";
beforeAll(installRules);
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
it("renders disabled payment and approval actions for a reader", () => {
  const c = client();
  c.payment.receipts = [payment()];
  const save = vi.fn();
  const form = renderToStaticMarkup(
    <PaymentForm
      clients={[c]}
      client={c}
      save={save}
      saving={false}
      writable={false}
    />,
  );
  expect(form).toContain('<fieldset disabled=""');
  const gates = renderToStaticMarkup(
    <Gates client={c} save={save} saving={false} writable={false} />,
  );
  expect(gates).toContain(
    'aria-label="Approve Booking · to Design" disabled=""',
  );
  expect(save).not.toHaveBeenCalled();
});
it("shows actionable form validation before calling save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const save = vi.fn();
  await act(async () =>
    root!.render(
      <PaymentForm
        clients={[client()]}
        save={save}
        saving={false}
        writable={true}
      />,
    ),
  );
  await act(async () =>
    node
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(node.textContent).toContain("Choose the client.");
  expect(save).not.toHaveBeenCalled();
});
it("preserves all master columns and safely escapes stored client text", () => {
  const html = renderToStaticMarkup(
    <Master clients={[client({ name: "<script>unsafe</script>" })]} />,
  );
  expect(html).toContain("52 fields");
  expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
  expect(html).not.toContain("<script>");
});
it("retains valid empty summary totals", () => {
  const html = renderToStaticMarkup(<Summary clients={[]} />);
  expect(html).toContain("Total (not cancelled)");
  expect(html).toContain("Nothing dispatched yet.");
  expect(html).toContain("₹0.00 L");
});
it("confirms a requested receipt once and leaves rejected receipts out of totals", () => {
  const c = client();
  c.payment.receipts = [
    { ...payment(59000), status: "Requested", requestedAt: "request-a" },
    { ...payment(1000), status: "Rejected" },
  ];
  decide(c, "payment", true, "", "", "request-a");
  expect(L().collected(c)).toBe(59000);
  expect(() => decide(c, "payment", true, "", "", "request-a")).toThrow();
  expect(L().collected(c)).toBe(59000);
});
it("does not approve zero-value or cancelled orders", () => {
  const zero = client({ order: { products: [{ value: 0 }] } });
  expect(() => approve(zero, "design")).toThrow();
  const cancelled = client({ stage: "bin" });
  cancelled.payment.receipts = [payment(1e6)];
  expect(() => approve(cancelled, "design")).toThrow();
});
it("redirects expired authentication and rejects malformed data", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}")),
  );
  // The caller keeps any unsaved draft, then goes to sign-in (shared/session).
  await expect(readStore()).rejects.toThrow("Session ended — sign in again.");
  expect(assign).not.toHaveBeenCalled();
  await expect(readStore()).rejects.toThrow("invalid format");
});
