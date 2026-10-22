// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { HeaderSession, Login, SignOut } from "../src/Auth";
import { signIn, signOut, installSessionRedirect } from "../src/api";
let root: Root | undefined, host: HTMLDivElement;
beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  vi.unstubAllGlobals();
});
async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
}
it("uses the existing credential API without storing credentials", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  await signIn("dummy@example.test", "test-only");
  expect(fetcher.mock.calls[0][0]).toBe("/api/auth/login");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    email: "dummy@example.test",
    password: "test-only",
  });
  expect(localStorage.length).toBe(0);
});
it.each([401, 429, 503])(
  "shows a safe login rejection for %s",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":"Please retry"}', { status }),
        ),
    );
    await expect(signIn("a@b.test", "test")).rejects.toThrow("Please retry");
  },
);
it("handles invalid response bodies without treating them as success", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("bad", { status: 503 })),
  );
  await expect(signIn("a@b.test", "test")).rejects.toThrow();
});
it("retains authenticated-session discovery and accessible labels", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  await render(<Login />);
  expect(host.querySelector('label[for="email"]')).not.toBeNull();
  expect(
    host.querySelector('input[autocomplete="current-password"]'),
  ).not.toBeNull();
  expect(host.textContent).toContain("Sign out");
});
it("prevents repeated login submission and restores retry after failure", async () => {
  let fail!: (reason: Error) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
  vi.stubGlobal("fetch", fetcher);
  const navigate = vi.fn();
  await render(<Login navigate={navigate} />);
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(host.querySelector<HTMLButtonElement>("#submit")!.disabled).toBe(true);
  expect(host.querySelector(".auth-spinner")).not.toBeNull();
  await act(async () => fail(new Error("Connection unavailable")));
  expect(host.textContent).toContain("Connection unavailable");
  expect(host.querySelector<HTMLButtonElement>("#submit")!.disabled).toBe(
    false,
  );
  expect(navigate).not.toHaveBeenCalled();
});
it("navigates after a successful login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  const navigate = vi.fn();
  await render(<Login navigate={navigate} />);
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(navigate).toHaveBeenCalledWith("/");
});
it("logout failure remains retryable and success redirects", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  const navigate = vi.fn();
  await render(<SignOut navigate={navigate} />);
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("Sign out failed");
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => host.querySelector("button")!.click());
  expect(navigate).toHaveBeenCalledWith("/login");
});
it("logout preserves POST contract", async () => {
  const f = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", f);
  await signOut();
  expect(f.mock.calls[0][0]).toBe("/api/auth/logout");
  expect(f.mock.calls[0][1].method).toBe("POST");
});
it("expired sessions redirect but 403 does not", async () => {
  const target = {
    fetch: vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        new Response("{}", { status: 403 }),
      ) as typeof fetch,
  };
  const navigate = vi.fn(),
    restore = installSessionRedirect(target, navigate);
  await target.fetch("/api/store");
  await target.fetch("/api/store");
  // The redirect waits a moment so the module can keep its unsaved draft first.
  expect(navigate).not.toHaveBeenCalled();
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith("/login?reason=ended");
  restore();
});

it.each(["admin", "reader", "assigned"])(
  "shows authenticated email and %s role independently of staff context",
  async (role) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "qa",
            email: "qa.person@example.test",
            role,
            active: 1,
          }),
        ),
      ),
    );
    await render(<HeaderSession />);
    expect(host.querySelector(".user-avatar")?.textContent).toBe("QP");
    expect(host.textContent).toContain("qa.person@example.test");
    expect(host.textContent).toContain(role);
    expect(host.textContent).not.toContain("Workspace view");
    expect(host.textContent).toContain("Sign out");
  },
);
it.each([
  new Response("{}", { status: 503 }),
  new Response('{"role":"admin","email":null}'),
])("keeps sign out available when identity cannot load", async (response) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await render(<HeaderSession />);
  expect(host.textContent).toContain("Account details unavailable");
  expect(host.textContent).toContain("Sign out");
  expect(host.querySelector(".user-avatar")?.textContent).toBe("?");
});
it("shows loading instead of inventing a staff identity", async () => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  await render(<HeaderSession />);
  expect(host.textContent).toContain("Loading account");
  expect(host.textContent).not.toContain("Workspace view");
});

it("password visibility and Caps Lock feedback do not send credentials", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  await render(<Login />);
  const calls = fetcher.mock.calls.length;
  const password = host.querySelector<HTMLInputElement>("#password")!;
  const toggle = host.querySelector<HTMLButtonElement>(
    '[aria-label="Show password"]',
  )!;
  await act(async () => toggle.click());
  expect(password.type).toBe("text");
  expect(toggle.getAttribute("aria-label")).toBe("Hide password");
  const event = new KeyboardEvent("keydown", { bubbles: true, key: "A" });
  Object.defineProperty(event, "getModifierState", { value: () => true });
  await act(async () => password.dispatchEvent(event));
  expect(host.textContent).toContain("Caps Lock");
  expect(fetcher).toHaveBeenCalledTimes(calls);
});
it("sends an admin who must enrol MFA to account security", async () => {
  const target = {
    fetch: vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":"x","mfa_enrollment_required":true}', {
          status: 403,
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"error":"Forbidden"}', { status: 403 }),
      )
      .mockResolvedValueOnce(
        new Response("not json", { status: 403 }),
      ) as typeof fetch,
  };
  const navigate = vi.fn(),
    restore = installSessionRedirect(target, navigate);
  const response = await target.fetch("/api/store");
  expect(await response.json()).toEqual({
    error: "x",
    mfa_enrollment_required: true,
  });
  await target.fetch("/api/store");
  await target.fetch("/api/store");
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith("/security");
  restore();
});
