// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, it, expect, vi } from "vitest";
import { Login } from "../src/Auth";
let root: Root, host: HTMLDivElement;
beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function signIn(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetcher);
  const navigate = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Login navigate={navigate} />));
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  return navigate;
}
const emailed = () =>
  new Response(
    '{"mfa_required":true,"method":"email","to":"i***@mymagppie.example"}',
    { status: 202 },
  );

it("after the password, asks for the code emailed to the masked address", async () => {
  const navigate = await signIn(
    vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(emailed()),
  );
  expect(navigate).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Check your email");
  expect(host.textContent).toContain("i***@mymagppie.example");
  expect(host.querySelector('input[type="password"]')).toBeNull();
});

it("sends the code and goes back to the page the person came from", async () => {
  vi.stubGlobal("location", { ...location, search: "?next=%2Faccounts%2F" });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValueOnce(emailed())
    .mockResolvedValueOnce(new Response('{"ok":true}'));
  const navigate = await signIn(fetcher);
  const digits = host.querySelectorAll<HTMLInputElement>(".auth-digits input");
  await act(async () =>
    digits[0].dispatchEvent(
      Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
        clipboardData: { getData: () => "123456" },
      }),
    ),
  );
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(fetcher).toHaveBeenLastCalledWith(
    "/api/auth/email-code/verify",
    expect.objectContaining({ body: '{"code":"123456"}' }),
  );
  expect(navigate).toHaveBeenCalledWith("/accounts/");
});

it("offers a new code only after 30 seconds and shows the server's answer", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValueOnce(emailed())
    .mockResolvedValueOnce(
      new Response('{"error":"No more codes for this sign-in."}', {
        status: 429,
      }),
    );
  await signIn(fetcher);
  const resend = () =>
    [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Send a new code"),
    )!;
  expect(resend().disabled).toBe(true);
  for (let i = 0; i < 30; i++)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  expect(resend().disabled).toBe(false);
  await act(async () => resend().click());
  expect(host.querySelector('[role="alert"]')!.textContent).toContain(
    "No more codes",
  );
});
