// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { install, client } from "./setup";
import {
  ProposalForm,
  TimelineForm,
  MeasurementForm,
  EptForm,
  AppliancesForm,
  DesignFlowForm,
  PdiForm,
} from "../src/Forms";
import { ClientForm } from "../src/ClientForm";
import { Field } from "../src/ui";
import { rules } from "../src/model";
import type { Context } from "../src/types";
import { Pre, Post, Today } from "../src/Pages";
import { Summary, Notifications } from "../src/Overview";
let root: Root, host: HTMLDivElement;
beforeAll(async () => {
  await install();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
});
async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(node));
}
function ctx(readOnly = false): Context {
  return {
    all: [],
    tab: "pre",
    page: "make",
    readOnly,
    update: (fn) => {
      if (!readOnly) fn?.();
    },
    show: vi.fn(),
    go: vi.fn(),
    close: vi.fn(),
  };
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("date input commits on blur once, including native input events", async () => {
  const commit = vi.fn();
  await render(<Field label="Date" type="date" value="" onCommit={commit} />);
  const input = host.querySelector("input")!;
  await fill(input, "2027-01-01");
  expect(commit).not.toHaveBeenCalled();
  await act(async () =>
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(commit).toHaveBeenCalledExactlyOnceWith("2027-01-01");
});
it("retains unsent proposal draft across close/reopen and shows validation", async () => {
  const c = client("draft-test", { stage: "design" });
  c.design.step = "withDesign";
  const context = ctx();
  await render(<ProposalForm c={c} ctx={context} />);
  await act(async () => host.querySelectorAll("button")[0]?.click());
  expect(host.textContent).toContain("positive estimate");
  const input = host.querySelector(
    '[aria-label="Estimate total (₹), including GST"]',
  ) as HTMLInputElement;
  await fill(input, "12345");
  await act(async () => root.render(<div />));
  await act(async () => root.render(<ProposalForm c={c} ctx={context} />));
  expect(
    (
      host.querySelector(
        '[aria-label="Estimate total (₹), including GST"]',
      ) as HTMLInputElement
    ).value,
  ).toBe("12345");
});
it.each([
  ProposalForm,
  TimelineForm,
  MeasurementForm,
  EptForm,
  AppliancesForm,
  DesignFlowForm,
  PdiForm,
  ClientForm,
])("renders native %s with labelled controls", async (Form) => {
  const c = client("forms", { stage: "post" });
  c.timeline.handover = "2027-03-01";
  rules().flow(c);
  await render(<Form c={c} ctx={ctx()} />);
  expect(host.querySelector("section")).not.toBeNull();
  for (const input of host.querySelectorAll("input,select"))
    expect(
      input.getAttribute("aria-label") || input.closest("label"),
    ).toBeTruthy();
  expect(host.querySelector("[dangerouslySetInnerHTML]")).toBeNull();
});
it("read-only notification opening does not persist seen markers", async () => {
  const c = client();
  c.news = [
    {
      at: new Date().toISOString(),
      text: "New design",
      tone: "blue",
      from: "Sales",
    },
  ];
  const context = ctx(true);
  context.update = vi.fn();
  await render(<Notifications all={[c]} ctx={context} />);
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("New design");
  expect(context.update).not.toHaveBeenCalled();
});
it("renders every route with empty states and summary navigation", async () => {
  await render(<Today all={[]} ctx={ctx()} />);
  expect(host.textContent).toContain("No proposals");
  for (const page of ["make", "timelines", "sales", "booking", "all"])
    await act(async () =>
      root.render(<Pre all={[]} ctx={{ ...ctx(), page }} />),
    );
  for (const page of ["board", "pdi", "collections", "factory", "tracker"]) {
    await act(async () =>
      root.render(<Post all={[]} ctx={{ ...ctx(), tab: "post", page }} />),
    );
    expect(host.textContent).toMatch(/No |Nothing/);
  }
  const context = ctx();
  await act(async () => root.render(<Summary all={[]} ctx={context} />));
  await act(async () => host.querySelector("button")!.click());
  expect(context.go).toHaveBeenCalledWith("today", "");
});
