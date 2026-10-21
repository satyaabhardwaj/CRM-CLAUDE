// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { install, fixture } from "./setup";
import { ManagementStore, readStore } from "../src/data";
beforeAll(install);
afterEach(() => vi.unstubAllGlobals());
it("only reads, normalizes a copy and exposes no mutation methods", async () => {
  const raw = { rev: 2, clients: fixture() },
    before = JSON.stringify(raw),
    fetch = vi.fn(async () => new Response(JSON.stringify(raw)));
  vi.stubGlobal("fetch", fetch);
  const store = new ManagementStore();
  await store.load();
  expect(store.state.data?.clients.length).toBe(7);
  expect(JSON.stringify(raw)).toBe(before);
  expect(fetch.mock.calls.length).toBe(1);
  expect("save" in store).toBe(false);
  expect("update" in store).toBe(false);
});
it.each([403, 503])(
  "reports access/load failure %s and can retry",
  async (code) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: code }))
      .mockResolvedValueOnce(new Response('{"rev":1,"clients":[]}'));
    vi.stubGlobal("fetch", fetch);
    const store = new ManagementStore();
    await store.load();
    expect(store.state.error).toMatch(code === 403 ? /access/ : /retry/);
    expect(store.state.data).toBeNull();
    await store.load();
    expect(store.state.error).toBe("");
    expect(store.state.data?.clients).toEqual([]);
  },
);
it.each([
  {},
  { rev: 1, clients: [null] },
  { rev: "1", clients: [] },
  { rev: -1, clients: [] },
])("rejects invalid server data", async (value) => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(value)));
  await expect(readStore()).rejects.toThrow("invalid");
});
it("retains last good data after failed refresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response('{"rev":1,"clients":[]}'))
      .mockRejectedValueOnce(Error("Offline")),
  );
  const store = new ManagementStore();
  await store.load();
  await store.poll();
  expect(store.state.data?.rev).toBe(1);
  expect(store.state.error).toBe("Offline");
});
it("deduplicates concurrent reads and stops notifying removed subscribers", async () => {
  let finish!: (v: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const store = new ManagementStore(),
    listener = vi.fn(),
    unsub = store.subscribe(listener);
  const first = store.load();
  await store.load();
  expect(fetch).toHaveBeenCalledTimes(1);
  unsub();
  const calls = listener.mock.calls.length;
  finish(new Response('{"rev":1,"clients":[]}'));
  await first;
  expect(listener).toHaveBeenCalledTimes(calls);
});
