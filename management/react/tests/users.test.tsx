// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, it, expect, vi } from "vitest";
import { install, fixture } from "./setup";
import { UsersPage } from "../src/Users";
import { forgetUser } from "../../../shared/session";
beforeAll(() => {
  install();
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
let root: Root | null = null,
  host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
  forgetUser();
});
const people = [
  {
    id: "u1",
    email: "boss@qa.invalid",
    role: "admin",
    active: true,
    mfa: true,
    last_login: 1800000000,
    must_change_password: false,
  },
  {
    id: "u2",
    email: "sales@qa.invalid",
    role: "sales",
    active: true,
    mfa: false,
    last_login: null,
    must_change_password: true,
  },
  {
    id: "u3",
    email: "gone@qa.invalid",
    role: "reader",
    active: false,
    mfa: false,
    last_login: null,
    must_change_password: false,
  },
];
function server(overrides: Record<string, Response> = {}) {
  const calls: [string, string, unknown][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([
        init?.method || "GET",
        url,
        init?.body ? JSON.parse(String(init.body)) : undefined,
      ]);
      if (overrides[url]) return overrides[url].clone();
      if (url === "/api/admin/users" && init?.method === "POST")
        return new Response(
          '{"id":"u9","temporary_password":"Temp-Password-123"}',
        );
      if (url.endsWith("/reset-password"))
        return new Response('{"temporary_password":"Reset-Password-456"}');
      if (url === "/api/admin/users")
        return new Response(
          JSON.stringify({
            users: people,
            roles: [
              "admin",
              "sales",
              "design",
              "measurement",
              "accounts",
              "reader",
              "assigned",
            ],
          }),
        );
      return new Response('{"ok":true}');
    }),
  );
  return calls;
}
async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<UsersPage />));
  await act(async () => {});
}
const button = (text: string, scope: ParentNode = host) =>
  [...scope.querySelectorAll("button")].find((b) => b.textContent === text)!;

it("lists people with role names, status, authenticator and the forced change", async () => {
  server();
  await mount();
  expect(host.textContent).toContain("boss@qa.invalid");
  expect(host.textContent).toContain("must choose a new password");
  expect(host.textContent).toContain("Deactivated");
  expect(
    host.querySelector<HTMLSelectElement>(
      'select[aria-label="Role for sales@qa.invalid"]',
    )!.value,
  ).toBe("sales");
  expect(
    [...host.querySelectorAll("option")].map((o) => o.textContent),
  ).toContain("View only");
  expect(button("Reactivate")).toBeTruthy();
});

it("adds a person and shows the temporary password once", async () => {
  const calls = server();
  await mount();
  const email = host.querySelector<HTMLInputElement>('input[type="email"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(email, "New@QA.invalid");
    email.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector(".management-user-add form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await act(async () => {});
  expect(calls).toContainEqual([
    "POST",
    "/api/admin/users",
    { email: "new@qa.invalid", role: "sales" },
  ]);
  expect(host.querySelector(".management-secret code")!.textContent).toBe(
    "Temp-Password-123",
  );
  await act(async () => button("Done, hide it").click());
  expect(host.textContent).not.toContain("Temp-Password-123");
  expect(
    JSON.stringify(sessionStorage) + JSON.stringify(localStorage),
  ).not.toContain("Temp-Password");
});

it("deactivation asks first; Escape cancels without a change", async () => {
  const calls = server();
  await mount();
  const row = [...host.querySelectorAll(".management-user-row")].find((r) =>
    r.textContent?.includes("sales@qa.invalid"),
  )!;
  await act(async () => button("Deactivate", row).click());
  const dialog = host.querySelector("dialog")!;
  expect(dialog.getAttribute("role")).toBe("alertdialog");
  expect(dialog.textContent).toContain("signed out everywhere at once");
  expect(document.activeElement?.textContent).toBe("Deactivate");
  await act(async () =>
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(calls.filter(([m]) => m === "POST")).toHaveLength(0);
  await act(async () => button("Deactivate", row).click());
  await act(async () =>
    button("Deactivate", host.querySelector("dialog")!).click(),
  );
  await act(async () => {});
  expect(calls).toContainEqual(["POST", "/api/admin/users/u2/deactivate", {}]);
});

it("reset password and role change confirm first", async () => {
  const calls = server();
  await mount();
  const row = [...host.querySelectorAll(".management-user-row")].find((r) =>
    r.textContent?.includes("sales@qa.invalid"),
  )!;
  await act(async () => button("Reset password", row).click());
  await act(async () =>
    button("Reset password", host.querySelector("dialog")!).click(),
  );
  await act(async () => {});
  expect(calls).toContainEqual([
    "POST",
    "/api/admin/users/u2/reset-password",
    {},
  ]);
  expect(host.querySelector(".management-secret code")!.textContent).toBe(
    "Reset-Password-456",
  );
  const select = row.querySelector("select")!;
  await act(async () => {
    select.value = "accounts";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelector("dialog")!.textContent).toContain(
    "becomes Accounts",
  );
  await act(async () =>
    button("Change role", host.querySelector("dialog")!).click(),
  );
  await act(async () => {});
  expect(calls).toContainEqual([
    "POST",
    "/api/admin/users/u2/role",
    { role: "accounts" },
  ]);
});

it("explains the server's refusal, with a way to set up the authenticator", async () => {
  server({
    "/api/admin/users": new Response(
      JSON.stringify({
        error: "Set up your authenticator app to manage users.",
      }),
      { status: 403 },
    ),
  });
  await mount();
  expect(host.querySelector('[role="alert"]')!.textContent).toContain(
    "authenticator",
  );
  expect(host.querySelector('a[href="/security"]')).toBeTruthy();
});

it("the Users tab is offered to administrators only", async () => {
  const { App } = await import("../src/App");
  for (const [role, shown] of [
    ["admin", true],
    ["reader", false],
    ["sales", false],
  ] as const) {
    forgetUser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/auth/me"
          ? new Response(JSON.stringify({ id: "x", role }))
          : new Response(JSON.stringify({ rev: 1, clients: fixture() })),
      ),
    );
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<App />));
    await act(async () => {});
    const tabs = [
      ...host.querySelectorAll('nav[aria-label="Management views"] button'),
    ].map((b) => b.textContent);
    expect(tabs.includes("Users")).toBe(shown);
    await act(async () => root!.unmount());
    root = null;
    host.remove();
  }
});
