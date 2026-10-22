// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, it, expect, vi } from "vitest";
import { ChangePassword, Security } from "../src/MFA";
let root: Root, host: HTMLDivElement;
const NEW = "Synthetic-New-Password-2026";
beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});
async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(node));
}
function type(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>("#" + id)!;
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector(".auth-change-password form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
function status(body: object) {
  return new Response(JSON.stringify(body));
}

it("sends the current password, new password and code, then clears every field", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{"ok":true}'));
  vi.stubGlobal("fetch", fetch);
  await render(<ChangePassword needsCode />);
  type("password-current", "current-secret");
  type("password-new", NEW);
  type("password-again", NEW);
  type("password-code", "123456");
  await submit();
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe("/api/auth/password");
  expect(JSON.parse(init.body)).toEqual({
    password: "current-secret",
    new_password: NEW,
    code: "123456",
  });
  expect(host.textContent).toContain("every other session has ended");
  for (const input of host.querySelectorAll("input"))
    expect(input.value).toBe("");
  expect(localStorage.length).toBe(0);
});

it("checks length and the repeat before calling the server", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await render(<ChangePassword needsCode={false} />);
  type("password-current", "current-secret");
  type("password-new", "short");
  type("password-again", "short");
  await submit();
  expect(host.textContent).toContain("at least 16 characters");
  type("password-new", NEW);
  type("password-again", NEW + "x");
  await submit();
  expect(host.textContent).toContain("do not match");
  expect(fetch).not.toHaveBeenCalled();
  expect(host.querySelector("#password-code")).toBeNull();
});

it("shows the server's reason and keeps the typed values for a retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(
      new Response('{"error":"Code is invalid, expired or already used."}', {
        status: 400,
      }),
    ),
  );
  await render(<ChangePassword needsCode />);
  type("password-current", "current-secret");
  type("password-new", NEW);
  type("password-again", NEW);
  type("password-code", "000000");
  await submit();
  expect(host.textContent).toContain("Code is invalid");
  expect(host.querySelector<HTMLInputElement>("#password-new")!.value).toBe(
    NEW,
  );
});

it("appears only once the account may change its password", async () => {
  const cases: [object, boolean, boolean][] = [
    [
      { available: true, enabled: false, recovery_codes: 0, required: true },
      false,
      false,
    ],
    [
      { available: true, enabled: true, recovery_codes: 9, required: true },
      true,
      true,
    ],
    [
      { available: true, enabled: false, recovery_codes: 0, required: false },
      true,
      false,
    ],
    [
      { available: false, enabled: false, recovery_codes: 0, required: false },
      true,
      false,
    ],
  ];
  for (const [body, shown, code] of cases) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(status(body)));
    await render(<Security />);
    expect(!!host.querySelector(".auth-change-password")).toBe(shown);
    expect(!!host.querySelector("#password-code")).toBe(code);
    await act(async () => root.unmount());
    host.remove();
  }
  await render(<div />);
});
