// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Sidebar } from "../src/Sidebar";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const items = [
  { id: "architects", label: "Architects", count: 44, group: "Settings" },
  { id: "qualified", label: "Leads", count: 4, group: "Pipeline" },
];
it("keeps route identifiers and counts while ordering groups", async () => {
  const navigate = vi.fn();
  await act(async () =>
    root.render(
      <Sidebar
        id="test"
        label="Pages"
        items={items}
        active="qualified"
        onNavigate={navigate}
      />,
    ),
  );
  const nav = host.querySelector("aside nav")!;
  expect(nav.querySelector("h2")?.textContent).toBe("Pipeline");
  expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain(
    "4",
  );
  await act(async () =>
    (
      nav.querySelector('[aria-label="Architects, 44"]') as HTMLButtonElement
    ).click(),
  );
  expect(navigate).toHaveBeenCalledWith("architects");
});
it("remembers collapse preference without a server request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  localStorage.setItem("crm.ui.sidebar.test", "collapsed");
  await act(async () =>
    root.render(
      <Sidebar
        id="test"
        label="Pages"
        items={items}
        active="qualified"
        onNavigate={() => {}}
      />,
    ),
  );
  expect(host.querySelector("aside")?.classList.contains("collapsed")).toBe(
    true,
  );
  await act(async () =>
    (host.querySelector(".crm-sidebar-toggle") as HTMLButtonElement).click(),
  );
  expect(localStorage.getItem("crm.ui.sidebar.test")).toBe("expanded");
  expect(fetcher).not.toHaveBeenCalled();
});
