// @vitest-environment jsdom
// Session end mid-save: the change is kept per user + module + client and saved once after sign-in.
import { beforeAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { install, client } from "./setup";
import { copy, SalesStore } from "../src/data";
import { resetSessionEnded } from "../../../shared/session";
import type { Store } from "../src/types";
beforeAll(install);
beforeEach(() => {
  sessionStorage.clear();
  resetSessionEnded();
  window.Kit.store.data = undefined as unknown as Store;
});
afterEach(() => vi.unstubAllGlobals());
const base = (): Store => ({ rev: 1, clients: [client(), client("c2")] });
function server(initial: Store, opts: { expired?: () => boolean } = {}) {
  const state = { store: copy(initial), puts: [] as Store[] };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (opts.expired?.())
        return Promise.resolve(new Response("{}", { status: 401 }));
      if (url === "/api/auth/me")
        return Promise.resolve(new Response('{"id":"u1","role":"admin"}'));
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        state.puts.push(body);
        state.store = { ...body, rev: body.rev + 1 };
        return Promise.resolve(
          new Response(JSON.stringify({ rev: state.store.rev })),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(state.store)));
    }),
  );
  return state;
}
it("keeps the unsaved change and goes to sign-in, then saves it once after signing in", async () => {
  let expired = false;
  const assign = vi.fn();
  vi.stubGlobal("location", {
    ...location,
    assign,
    pathname: "/sales/",
    search: "",
    hash: "#x",
  });
  const first = server(base(), { expired: () => expired });
  const s = new SalesStore();
  await s.load();
  expired = true;
  s.update(() => {
    window.Kit.store.data.clients[0].city = "Kept city";
  });
  await vi.waitFor(() => expect(s.state.saving).toBe(false));
  expect(assign).toHaveBeenCalledWith(
    "/login?reason=ended&next=%2Fsales%2F%23x",
  );
  expect(Object.keys(sessionStorage)).toEqual(["crm.draft.u1.sales.c1"]);
  expect(first.puts).toHaveLength(0);

  // Signed in again: a fresh page load replays the kept change on the newest copy.
  window.Kit.store.data = undefined as unknown as Store;
  const latest = copy(first.store);
  latest.clients[1].city = "Changed by someone else";
  const second = server(latest);
  const t = new SalesStore();
  await t.load();
  await vi.waitFor(() => expect(t.state.dirty).toBe(false));
  expect(second.puts).toHaveLength(1);
  expect(second.store.clients[0].city).toBe("Kept city");
  expect(second.store.clients[1].city).toBe("Changed by someone else");
  expect(sessionStorage.length).toBe(0);
});
it("never overwrites a client that changed meanwhile and says so", async () => {
  sessionStorage.setItem(
    "crm.draft.u1.sales.c1",
    JSON.stringify({ before: client(), after: { ...client(), city: "Mine" } }),
  );
  const latest = base();
  latest.clients[0].city = "Theirs";
  const state = server(latest);
  const s = new SalesStore();
  await s.load();
  await vi.waitFor(() =>
    expect(s.state.error).toContain("record changed meanwhile"),
  );
  expect(state.puts).toHaveLength(0);
  expect(s.state.error).toContain("Synthetic c1");
  expect(sessionStorage.length).toBe(0);
});
it("another person's drafts in this tab are not applied", async () => {
  sessionStorage.setItem(
    "crm.draft.u2.sales.c1",
    JSON.stringify({
      before: client(),
      after: { ...client(), city: "Other user" },
    }),
  );
  const state = server(base());
  const s = new SalesStore();
  await s.load();
  expect(state.puts).toHaveLength(0);
  expect(sessionStorage.length).toBe(1);
});
