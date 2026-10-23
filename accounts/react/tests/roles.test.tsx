// @vitest-environment jsdom
// Accounts edits and the four approvals belong to accounts and admin; everyone else views.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { installRules, client } from "./setup";
import { useStore } from "../src/store";
beforeAll(() => {
  installRules();
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  vi.unstubAllGlobals();
});
let hook: ReturnType<typeof useStore>;
function Harness() {
  hook = useStore(false);
  return null;
}
async function mount(role: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/auth/me"
        ? new Response(JSON.stringify({ id: "u1", role }))
        : new Response(JSON.stringify({ rev: 1, clients: [client()] })),
    ),
  );
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(<Harness />));
  await act(async () => {});
}
it.each([
  ["admin", true],
  ["accounts", true],
  ["sales", false],
  ["design", false],
  ["measurement", false],
  ["reader", false],
])("%s may record payments and approve: %s", async (role, can) => {
  await mount(role);
  expect(hook.roleKnown).toBe(true);
  expect(hook.writable).toBe(can);
});
