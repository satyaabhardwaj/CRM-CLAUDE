// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AppHeader, DEPARTMENTS, OPEN_NAVIGATION } from "../src/Shell";
import { Sidebar } from "../src/Sidebar";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 401 })),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("names the five departments, with Management instead of a person", async () => {
  await act(async () => root.render(<AppHeader current="design" />));
  const links = [...host.querySelectorAll("nav[aria-label=Departments] a")];
  expect(links.map((a) => a.textContent)).toEqual(
    DEPARTMENTS.map(([, label]) => label),
  );
  expect(links.map((a) => a.textContent)).toContain("Management");
  expect(links.map((a) => a.getAttribute("href"))).toEqual([
    "/sales/",
    "/design/",
    "/measurement/",
    "/accounts/",
    "/management/",
  ]);
  const current = host.querySelectorAll('[aria-current="page"]');
  expect(current).toHaveLength(1);
  expect(current[0].textContent).toBe("Design");
});
it("keeps the user menu last so keyboard order follows the screen", async () => {
  await act(async () =>
    root.render(
      <AppHeader
        current="sales"
        navigation="Sales navigation"
        search={<input aria-label="Find a client" />}
        actions={<button type="button">Bell</button>}
        primary={<button type="button">New opportunity</button>}
      />,
    ),
  );
  // The user menu's own links are inside its closed panel, so they are not in the tab order.
  const focusable = [
    ...host.querySelectorAll("header a, header button, header summary"),
  ]
    .filter((e) => !e.closest(".user-menu-panel"))
    .map((e) => e.getAttribute("aria-label") || e.textContent);
  expect(focusable[0]).toBe("Open Sales navigation");
  expect(focusable.at(-1)).toBe("User menu");
  expect(focusable.indexOf("New opportunity")).toBeLessThan(
    focusable.indexOf("User menu"),
  );
});
it("opens the module's sidebar drawer from the header menu button", async () => {
  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  const opened = vi.fn();
  window.addEventListener(OPEN_NAVIGATION, opened);
  await act(async () =>
    root.render(
      <>
        <AppHeader current="sales" navigation="Sales navigation" />
        <Sidebar
          id="test"
          label="Sales navigation"
          items={[{ id: "qualified", label: "Leads", count: 3 }]}
          active="qualified"
          onNavigate={() => {}}
        />
      </>,
    ),
  );
  const menu = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Open Sales navigation"]',
  )!;
  await act(async () => menu.click());
  expect(opened).toHaveBeenCalledOnce();
  expect(showModal).toHaveBeenCalledOnce();
  expect(host.querySelector("dialog.crm-drawer")?.hasAttribute("open")).toBe(
    true,
  );
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'dialog button[aria-label="Close navigation"]',
      )!
      .click(),
  );
  expect(host.querySelector("dialog.crm-drawer")?.hasAttribute("open")).toBe(
    false,
  );
  expect(document.activeElement).toBe(menu);
  window.removeEventListener(OPEN_NAVIGATION, opened);
});
it("opens and closes the search from its icon", async () => {
  await act(async () =>
    root.render(
      <AppHeader
        current="sales"
        search={<input aria-label="Find a client" />}
      />,
    ),
  );
  const toggle = host.querySelector<HTMLButtonElement>(".app-search-toggle")!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  await act(async () => toggle.click());
  expect(host.querySelector("header")?.classList.contains("searching")).toBe(
    true,
  );
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Find a client",
  );
  await act(async () => toggle.click());
  expect(host.querySelector("header")?.classList.contains("searching")).toBe(
    false,
  );
});
