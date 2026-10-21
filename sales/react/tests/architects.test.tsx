// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { install, client, context } from "./setup";
import { ArchitectPage } from "../src/MasterPages";
import { ArchitectPicker } from "../src/ArchitectPicker";
import { architects, rules } from "../src/model";

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  await install();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  window.Kit.store.data.architects = [
    {
      id: "a001",
      name: "Synthetic architect",
      firm: "Fixture",
      phone: "",
      rate: 5,
    },
  ];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  expect(button).toBeTruthy();
  await act(() => button!.click());
}
it("archives and restores a linked architect without changing client money or identity", async () => {
  const c = client("c1", { architectId: "a001", architectInvolved: true });
  const before = JSON.stringify(c),
    totals = rules().totals(c);
  function Screen() {
    const [, redraw] = useState(0);
    const ctx = context(c);
    ctx.update = (change) => {
      change?.();
      redraw((v) => v + 1);
    };
    return <ArchitectPage ctx={ctx} />;
  }
  await act(() => root.render(<Screen />));
  await click("Archive");
  expect(architects()).toHaveLength(1);
  expect(architects()[0].archived).toBe(true);
  expect(host.querySelector('input[value="Synthetic architect"]')).toBeNull();
  await click("Show archived");
  expect(host.textContent).toContain("Archived architects");
  await click("Restore");
  expect(architects()[0].archived).toBe(false);
  await click("Show active");
  expect(
    host.querySelector('input[value="Synthetic architect"]'),
  ).not.toBeNull();
  expect(JSON.stringify(c)).toBe(before);
  expect(rules().totals(c)).toEqual(totals);
});
it("hides archived options for new assignments but retains an existing selected association", async () => {
  architects()[0].archived = true;
  const props = { on: true, onToggle: () => {}, onPick: () => {} };
  await act(() => root.render(<ArchitectPicker {...props} id="" />));
  expect(host.querySelector('option[value="a001"]')).toBeNull();
  await act(() => root.render(<ArchitectPicker {...props} id="a001" />));
  expect(host.querySelector('option[value="a001"]')?.textContent).toContain(
    "Archived",
  );
  expect(host.querySelector("select")?.value).toBe("a001");
});
