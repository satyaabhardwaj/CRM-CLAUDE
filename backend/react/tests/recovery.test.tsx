// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Recovery } from "../src/Recovery";
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
  history.replaceState(null, "", "/");
});
async function render(reset = false) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Recovery reset={reset} />));
}
it("clears token fragment and renders accessible reset fields", async () => {
  history.replaceState(null, "", "/reset-password#token=" + "a".repeat(43));
  await render(true);
  expect(location.hash).toBe("");
  expect(
    host.querySelectorAll('input[autocomplete="new-password"]'),
  ).toHaveLength(2);
  expect(host.querySelector('label[for="confirm-password"]')).not.toBeNull();
});
it("rejects missing links without submitting", async () => {
  await render(true);
  expect(host.textContent).toContain("missing or invalid");
  expect(host.querySelector("form")).toBeNull();
});
it("shows generic success without navigating or logging in", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ message: "If eligible, a link will be sent." }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await render();
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(fetcher.mock.calls[0][0]).toBe("/api/auth/forgot-password");
  expect(host.textContent).toContain("If eligible");
  expect(host.querySelector("form")).toBeNull();
});
it("blocks duplicates and permits retry after failure", async () => {
  let reject!: (error: Error) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  await render();
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
  await act(async () => reject(new Error("Connection unavailable")));
  expect(host.querySelector("button")!.disabled).toBe(false);
  expect(host.textContent).toContain("Connection unavailable");
});
it("shows server error without treating it as success", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Recovery unavailable" }), {
        status: 503,
      }),
    ),
  );
  await render();
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.textContent).toContain("Recovery unavailable");
  expect(host.querySelector("form")).not.toBeNull();
});
