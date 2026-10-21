// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { installRules, client, payment } from "./setup";
import { transact } from "../src/store";
import { record, type Store } from "../src/model";
beforeAll(installRules);
afterEach(() => vi.unstubAllGlobals());
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}
it("rebases a stale save on the latest revision without overwriting unrelated edits", async () => {
  let data: Store = {
    rev: 1,
    clients: [client(), client({ id: "other", custom: "original" })],
    settings: { keep: 1 },
  };
  let puts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (!options?.method) return response(data);
      puts++;
      if (puts === 1) {
        data = {
          ...data,
          rev: 2,
          clients: [
            data.clients[0],
            { ...data.clients[1], custom: "concurrent edit" },
          ],
        };
        return response({}, 409);
      }
      data = JSON.parse(options.body);
      data.rev++;
      return response({ ok: true, rev: data.rev });
    }),
  );
  const saved = await transact("synthetic-a", "operation-1", (c) =>
    record(c, payment()),
  );
  expect(puts).toBe(2);
  expect(saved.clients[0].payment.receipts).toHaveLength(1);
  expect(saved.clients[1].custom).toBe("concurrent edit");
  expect(saved.settings).toEqual({ keep: 1 });
});
it("reconciles a lost success response without recording the payment twice", async () => {
  let data: Store = { rev: 1, clients: [client()] };
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (!options?.method) return response(data);
      writes++;
      data = JSON.parse(options.body);
      data.rev++;
      throw Error("connection lost after commit");
    }),
  );
  await expect(
    transact("synthetic-a", "same-operation", (c) => record(c, payment())),
  ).rejects.toThrow("could not be confirmed");
  const saved = await transact("synthetic-a", "same-operation", (c) =>
    record(c, payment()),
  );
  expect(writes).toBe(1);
  expect(saved.clients[0].payment.receipts).toHaveLength(1);
});
it("does not silently retry forbidden writes or unbounded conflicts", async () => {
  const read = { rev: 1, clients: [client()] };
  const fetcher = vi.fn(async (_url, options) =>
    response(options?.method ? {} : read, options?.method ? 403 : 200),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    transact("synthetic-a", "a", (c) => record(c, payment())),
  ).rejects.toThrow("cannot save");
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockImplementation(async (_url, options) =>
    response(options?.method ? {} : read, options?.method ? 409 : 200),
  );
  fetcher.mockClear();
  await expect(
    transact("synthetic-a", "b", (c) => record(c, payment())),
  ).rejects.toThrow("another window");
  expect(fetcher).toHaveBeenCalledTimes(6);
});
it("does not write if latest business state invalidates an approval", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      response({ rev: 1, clients: [client({ stage: "bin" })] }),
    ),
  );
  await expect(
    transact("synthetic-a", "a", (c) => record(c, payment())),
  ).rejects.toThrow("no longer active");
  expect(fetch).toHaveBeenCalledTimes(1);
});
