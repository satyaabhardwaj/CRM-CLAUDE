// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { install, client } from "./setup";
import {
  copy,
  merge,
  normalize,
  persist,
  readStore,
  SalesStore,
} from "../src/data";
import type { Store } from "../src/types";
beforeAll(install);
afterEach(() => vi.unstubAllGlobals());
const base = (): Store => ({
  rev: 1,
  clients: [client(), client("c2")],
  settings: { keep: true },
});
it("normalizes a copy without changing legacy data or unknown fields", () => {
  const raw = base();
  const before = JSON.stringify(raw);
  normalize(raw);
  expect(JSON.stringify(raw)).toBe(before);
});
it("recognizes persisted records even when JSONB reorders object keys", () => {
  const b = base(),
    draft = copy(b);
  draft.clients[0].city = "Saved";
  const latest = copy(draft);
  latest.clients[0] = Object.fromEntries(
    Object.entries(latest.clients[0]).reverse(),
  ) as (typeof latest.clients)[0];
  expect(merge(b, draft, latest)).toEqual(latest);
});
it("preserves other-client edits and unrelated top-level fields on rebase", () => {
  const b = base(),
    draft = copy(b),
    latest = copy(b);
  draft.clients[0].city = "Changed";
  latest.rev++;
  latest.clients[1].phone = "new phone";
  latest.extra = { keep: true };
  const out = merge(b, draft, latest);
  expect(out.clients[1]).toEqual(latest.clients[1]);
  expect(out.extra).toEqual({ keep: true });
  expect(out.clients[0].city).toBe("Changed");
});
it("rejects same-client concurrent edits and does not mutate any input", () => {
  const b = base(),
    d = copy(b),
    l = copy(b);
  d.clients[0].city = "one";
  l.clients[0].phone = "two";
  const saved = JSON.stringify(l);
  expect(() => merge(b, d, l)).toThrow("another window");
  expect(JSON.stringify(l)).toBe(saved);
});
it("does not persist render-time defaults on unrelated clients", () => {
  const raw: Store = {
    rev: 1,
    clients: [
      { id: "a", cid: "C-1", pid: "P-1", name: "A", stage: "qualified" },
      client("b"),
    ],
  };
  const b = normalize(raw),
    d = copy(b);
  d.clients[1].city = "new";
  expect(merge(b, d, raw, raw).clients[0]).toEqual(raw.clients[0]);
});
it("handles time-dependent defaults using raw optimistic baseline", () => {
  const raw: Store = {
    rev: 1,
    clients: [{ id: "a", cid: "C-1", pid: "P-1", name: "A", stage: "post" }],
  };
  const b = normalize(raw),
    d = copy(b);
  d.clients[0].city = "new";
  expect(merge(b, d, raw, raw).clients[0].city).toBe("new");
});
it("reassigns colliding project/customer numbers on new clients", () => {
  const b = base(),
    d = copy(b);
  d.clients.push(client("new"));
  const out = merge(b, d, b);
  expect(out.clients[2].pid).toBe("P-9002");
  expect(out.clients[2].cid).toBe("C-9002");
});
it("blocks concurrent shared settings changes", () => {
  const b = base(),
    d = copy(b),
    l = copy(b);
  d.settings = { mine: true };
  l.settings = { theirs: true };
  expect(() => merge(b, d, l)).toThrow("Shared Sales settings");
});
it("recognizes a successful lost-response save without a second PUT", async () => {
  const b = base(),
    d = copy(b);
  d.clients[0].city = "Saved";
  const f = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ...d, rev: 2 })));
  vi.stubGlobal("fetch", f);
  expect((await persist(b, d)).clients[0].city).toBe("Saved");
  expect(f).toHaveBeenCalledTimes(1);
});
it("retries revision conflicts at most three times", async () => {
  const b = base(),
    d = copy(b);
  d.clients[0].city = "Saved";
  const f = vi.fn((_url, init) =>
    Promise.resolve(
      init?.method === "PUT"
        ? new Response("{}", { status: 409 })
        : new Response(JSON.stringify(b)),
    ),
  );
  vi.stubGlobal("fetch", f);
  await expect(persist(b, d)).rejects.toThrow("another window");
  expect(f).toHaveBeenCalledTimes(6);
});
it("rejects malformed store and denied reads", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("{}", { status: 403 })),
  );
  await expect(readStore()).rejects.toThrow("invalid format");
  await expect(readStore()).rejects.toThrow("access");
});
it("keeps failed drafts and retries without repeating the mutation", async () => {
  const b = base();
  let server = copy(b),
    fail = true,
    writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) => {
      if (url === "/api/auth/me")
        return Promise.resolve(new Response('{"role":"admin"}'));
      if (init?.method === "PUT") {
        writes++;
        if (fail) return Promise.resolve(new Response("{}", { status: 503 }));
        server = { ...JSON.parse(init.body), rev: 2 };
        return Promise.resolve(new Response('{"rev":2}'));
      }
      return Promise.resolve(new Response(JSON.stringify(server)));
    }),
  );
  const s = new SalesStore();
  await s.load();
  let changes = 0;
  s.update(() => {
    changes++;
    window.Kit.store.data.clients[0].city = "New";
  });
  await vi.waitFor(() => expect(s.state.saving).toBe(false));
  expect(s.state.dirty).toBe(true);
  fail = false;
  s.retry();
  await vi.waitFor(() => expect(s.state.dirty).toBe(false));
  expect(changes).toBe(1);
  expect(writes).toBe(2);
  expect(server.clients[0].city).toBe("New");
});
it("reader mutations never run or issue writes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve(
        new Response(
          JSON.stringify(url === "/api/auth/me" ? { role: "reader" } : base()),
        ),
      ),
    ),
  );
  const s = new SalesStore();
  await s.load();
  const mutation = vi.fn();
  s.update(mutation);
  expect(mutation).not.toHaveBeenCalled();
  expect(s.state.writable).toBe(false);
});
it("keeps client references usable after save for asynchronous upload callbacks", async () => {
  let server = base();
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) => {
      if (url === "/api/auth/me")
        return Promise.resolve(new Response('{"role":"admin"}'));
      if (init?.method === "PUT") {
        server = { ...JSON.parse(init.body), rev: server.rev + 1 };
        return Promise.resolve(
          new Response(JSON.stringify({ rev: server.rev })),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(server)));
    }),
  );
  const s = new SalesStore();
  await s.load();
  const held = window.Kit.store.data.clients[0];
  s.update(() => {
    held.city = "First change";
  });
  await vi.waitFor(() => expect(s.state.saving).toBe(false));
  expect(window.Kit.store.data.clients[0]).toBe(held);
  s.update(() => {
    (held.docs as Record<string, string>).layout = "synthetic.txt";
  });
  await vi.waitFor(() => expect(s.state.saving).toBe(false));
  expect((server.clients[0].docs as Record<string, string>).layout).toBe(
    "synthetic.txt",
  );
});
it("queues an upload completion during a failed save and persists both once retried", async () => {
  let server = base(),
    fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) => {
      if (url === "/api/auth/me")
        return Promise.resolve(new Response('{"role":"admin"}'));
      if (init?.method === "PUT") {
        if (fail) return Promise.resolve(new Response("{}", { status: 503 }));
        server = { ...JSON.parse(init.body), rev: server.rev + 1 };
        return Promise.resolve(
          new Response(JSON.stringify({ rev: server.rev })),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(server)));
    }),
  );
  const s = new SalesStore();
  await s.load();
  const c = window.Kit.store.data.clients[0];
  s.update(() => {
    c.city = "New city";
  });
  s.update(() => {
    (c.docs as Record<string, string>).layout = "uploaded.pdf";
  });
  await vi.waitFor(() => expect(s.state.saving).toBe(false));
  expect(s.state.dirty).toBe(true);
  expect(
    (server.clients[0].docs as Record<string, string>).layout,
  ).toBeUndefined();
  fail = false;
  s.retry();
  await vi.waitFor(() => {
    expect(s.state.dirty).toBe(false);
    expect((server.clients[0].docs as Record<string, string>).layout).toBe(
      "uploaded.pdf",
    );
  });
  expect(server.clients[0].city).toBe("New city");
});
