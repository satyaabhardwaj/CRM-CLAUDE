// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, it, expect, vi } from "vitest";
import { MFAChallenge, Security } from "../src/MFA";
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
});
async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(node));
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
it("password success with MFA does not navigate or grant a UI session", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        new Response('{"mfa_required":true}', { status: 202 }),
      ),
  );
  const navigate = vi.fn();
  await render(<Login navigate={navigate} />);
  await submit();
  expect(navigate).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Verify your sign-in");
  expect(host.querySelector('input[type="password"]')).toBeNull();
});
it("switches to a recovery code without persisting secrets", async () => {
  await render(<MFAChallenge />);
  await act(async () => host.querySelectorAll("button")[1].click());
  expect(host.querySelector('label[for="mfa-code"]')?.textContent).toBe(
    "Recovery code",
  );
  expect(localStorage.length).toBe(0);
});
it("does not navigate on a rejected factor and allows retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":"Code already used"}', { status: 401 }),
      ),
  );
  const navigate = vi.fn();
  await render(<MFAChallenge navigate={navigate} />);
  await submit();
  expect(navigate).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Code already used");
  expect(host.querySelector("button")!.disabled).toBe(false);
});
it("navigates only after factor verification", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('{"ok":true}')),
  );
  const navigate = vi.fn();
  await render(<MFAChallenge navigate={navigate} />);
  await submit();
  expect(navigate).toHaveBeenCalledWith("/");
});
it("blocks duplicate verification while pending", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
  vi.stubGlobal("fetch", fetcher);
  await render(<MFAChallenge navigate={vi.fn()} />);
  await act(async () => {
    for (let i = 0; i < 2; i++)
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(host.querySelector("button")!.disabled).toBe(true);
  await act(async () => finish(new Response("{}")));
});
it("does not expose setup controls when service is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"available":false,"enabled":false,"recovery_codes":0}'),
      ),
  );
  await render(<Security />);
  expect(host.textContent).toContain("unavailable");
  expect(host.querySelector("form")).toBeNull();
});
it("shows setup key only after authenticated setup, then one-time backup codes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('{"available":true,"enabled":false,"recovery_codes":0}'),
    )
    .mockResolvedValueOnce(
      new Response('{"secret":"SYNTHETICKEY","uri":"otpauth://totp/qa"}'),
    )
    .mockResolvedValueOnce(
      new Response('{"recovery_codes":["synthetic-backup-code"]}'),
    );
  vi.stubGlobal("fetch", fetcher);
  await render(<Security />);
  expect(host.textContent).not.toContain("SYNTHETICKEY");
  await submit();
  expect(host.textContent).toContain("SYNTHETICKEY");
  await submit();
  expect(host.textContent).toContain("synthetic-backup-code");
  expect(host.textContent).not.toContain("SYNTHETICKEY");
  expect(host.querySelector("form")).toBeNull();
});
