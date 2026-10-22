// @vitest-environment jsdom
// Only Measurement (and admins) mark the Measurement bell as read; others just see it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, it, expect, vi } from "vitest";
import { Notifications } from "../src/Notifications";
beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no modal dialogs.
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
});
const store = {
  rev: 1,
  clients: [
    {
      name: "Synthetic",
      stage: "booked",
      news: [{ at: "2026-10-22T10:00:00Z", text: "Request", from: "Sales" }],
    },
  ],
};
it.each([
  [true, 1],
  [false, 0],
])("writable %s sends %i mark-as-read save", async (writable, puts) => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PUT"
      ? new Response('{"rev":2}')
      : new Response(JSON.stringify(store)),
  );
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Notifications writable={writable} />));
  await act(async () => {});
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button.bell")!.click(),
  );
  await act(async () => {});
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "PUT"),
  ).toHaveLength(puts);
});
