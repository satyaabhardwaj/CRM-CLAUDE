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
  expect(host.querySelector(".auth-spinner")).not.toBeNull();
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
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copy },
  });
  const buttons = Array.from(host.querySelectorAll("button"));
  await act(async () =>
    buttons.find((b) => b.textContent === "Copy recovery codes")!.click(),
  );
  expect(copy).toHaveBeenCalledWith("synthetic-backup-code");
  expect(host.textContent).toContain("Codes copied");
  const create = vi.fn().mockReturnValue("blob:synthetic");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: create,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await act(async () =>
    buttons.find((b) => b.textContent === "Download codes")!.click(),
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

it("pastes six digits, moves focus and submits the unchanged factor payload", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  await render(<MFAChallenge navigate={vi.fn()} />);
  const inputs = host.querySelectorAll<HTMLInputElement>("input");
  expect(inputs.length).toBe(6);
  expect(inputs[0].autocomplete).toBe("one-time-code");
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", {
    value: { getData: () => "123456" },
  });
  await act(async () => inputs[0].dispatchEvent(paste));
  expect(
    Array.from(inputs)
      .map((i) => i.value)
      .join(""),
  ).toBe("123456");
  expect(document.activeElement).toBe(inputs[5]);
  await submit();
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ code: "123456" });
  expect(host.textContent).toContain("5 minutes");
});
it("empty digit backspace returns focus to the previous box", async () => {
  await render(<MFAChallenge />);
  const inputs = host.querySelectorAll<HTMLInputElement>("input");
  await act(async () =>
    inputs[2].dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement).toBe(inputs[1]);
});
it("tells an unenrolled admin MFA is required and never offers disable", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '{"available":true,"enabled":false,"recovery_codes":0,"required":true}',
        ),
      ),
  );
  await render(<Security />);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "must use an authenticator app",
  );
  await act(async () => root.unmount());
  host.remove();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '{"available":true,"enabled":true,"recovery_codes":9,"required":true}',
        ),
      ),
  );
  await render(<Security />);
  const options = Array.from(host.querySelectorAll("option")).map(
    (o) => o.value,
  );
  expect(options).toEqual(["recovery-codes"]);
  expect(host.textContent).toContain("cannot disable");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it("optional roles can still choose to disable", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '{"available":true,"enabled":true,"recovery_codes":10,"required":false}',
        ),
      ),
  );
  await render(<Security />);
  expect(
    Array.from(host.querySelectorAll("option")).map((o) => o.value),
  ).toEqual(["recovery-codes", "disable"]);
});
