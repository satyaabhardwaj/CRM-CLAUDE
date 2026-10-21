// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { install, client, context } from "./setup";
import { upload } from "../src/data";
let opportunity: typeof import("../src/NewOpportunity").opportunity;
let initialDraft: typeof import("../src/NewOpportunity").initialDraft;
let NewOpportunity: typeof import("../src/NewOpportunity").NewOpportunity;
let root: Root | undefined;
beforeAll(async () => {
  await install();
  ({ opportunity, initialDraft, NewOpportunity } =
    await import("../src/NewOpportunity"));
});
afterEach(async () => {
  if (root) await act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
it("validates required fields before allocating a new record", () => {
  expect(() => opportunity(initialDraft, [])).toThrow("Name, phone and source");
});
it("creates a qualified lead with unique identifiers and unchanged existing records", () => {
  const prior = [client()];
  const before = JSON.stringify(prior);
  const c = opportunity(
    {
      ...initialDraft,
      name: "  New  ",
      phone: "0000000000",
      source: "Walk-in",
    },
    prior,
  );
  expect(c.name).toBe("New");
  expect(c.stage).toBe("qualified");
  expect(c.pid).toBe("P-9002");
  expect(c.cid).toBe("C-9002");
  expect(c.city).toBe("City not set");
  expect(JSON.stringify(prior)).toBe(before);
});
it("renders validation errors and keeps the form instead of saving invalid input", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const ctx = context(client());
  ctx.update = vi.fn();
  await act(() => root!.render(<NewOpportunity ctx={ctx} disabled={false} />));
  await act(() =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "Name, phone and source",
  );
  expect(ctx.update).not.toHaveBeenCalled();
});
it("disabled form cannot submit changes", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const ctx = context(client());
  ctx.update = vi.fn();
  await act(() => root!.render(<NewOpportunity ctx={ctx} disabled />));
  expect(host.querySelector("fieldset")!.disabled).toBe(true);
  await act(() =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(ctx.update).not.toHaveBeenCalled();
});
it("upload failure and malformed responses do not produce a saved filename", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response("{}")),
  );
  const file = new File(["synthetic"], "layout.txt");
  await expect(upload("c1", file)).rejects.toThrow("retained");
  await expect(upload("c1", file)).rejects.toThrow("not confirmed");
});
