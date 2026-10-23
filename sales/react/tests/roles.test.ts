// @vitest-environment jsdom
// The screen reflects the role; the server enforces it (backend/permissions.py).
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { install, client } from "./setup";
import { SalesStore } from "../src/data";
import type { Store } from "../src/types";
beforeAll(install);
afterEach(() => vi.unstubAllGlobals());
const base = (): Store => ({ rev: 1, clients: [client()] });
async function load(role: string) {
  window.Kit.store.data = undefined as unknown as Store;
  const put = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "PUT") put();
      return Promise.resolve(
        new Response(
          JSON.stringify(url === "/api/auth/me" ? { id: "u1", role } : base()),
        ),
      );
    }),
  );
  const store = new SalesStore();
  await store.load();
  return { store, put };
}
it.each(["admin", "sales"])("%s may change Sales", async (role) => {
  const { store } = await load(role);
  expect(store.state.writable).toBe(true);
});
it.each(
  ["sales", "design", "measurement", "accounts", "reader"].filter(
    (r) => r !== "sales",
  ),
)("%s views Sales only: no change runs and nothing is sent", async (role) => {
  const { store, put } = await load(role);
  expect(store.state.writable).toBe(false);
  const change = vi.fn();
  store.update(change);
  expect(change).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect(store.state.error).toBe("View only: your role cannot change Sales.");
});
