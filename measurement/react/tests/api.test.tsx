// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRequests } from "../src/api";
let root: Root | undefined;
let current: ReturnType<typeof useRequests>;
function Harness() {
  current = useRequests(false);
  return (
    <div>
      {current.loading
        ? "Loading"
        : current.error || current.records.length + " requests"}
    </div>
  );
}
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<Harness />));
  return node;
}
// The pages read the CRM's own visits (23 Oct 2026); Zoho is being switched off.
const payload = {
  clients: [
    {
      id: "test",
      name: "Synthetic",
      visits: [
        { id: "v1", type: "pdi", status: "done", date: "2026-10-01" },
        { id: "v2", type: "first", status: "cancelled" },
      ],
    },
  ],
};
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("visits API lifecycle", () => {
  it("normalizes real-shaped records and recovers from a failed refresh", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetcher);
    const node = await mount();
    expect(node.textContent).toBe("1 requests");
    expect(current.records[0].status).toBe("Done");
    expect(current.records[0].stage).toBe("PDI");
    expect(current.records[0].id).toBe("test|v1");
    const synced = current.syncedAt;
    await act(async () => current.refresh(true));
    expect(current.error).toContain("could not be loaded");
    expect(current.syncedAt).toBe(synced);
    await act(async () => current.refresh(true));
    expect(current.error).toBe("");
    expect(node.textContent).toBe("1 requests");
    expect(fetcher.mock.calls[1][0]).toBe("/api/measurement/board");
  });
  it("reports forbidden access and malformed payloads without inventing empty data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 403 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ requests: [] }))),
    );
    await mount();
    expect(current.error).toContain("permission");
    await act(async () => current.refresh());
    expect(current.error).toContain("invalid response");
    expect(current.syncedAt).toBe("");
  });
  it("distinguishes a successful empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ clients: [] }))),
    );
    await mount();
    expect(current.error).toBe("");
    expect(current.records).toHaveLength(0);
    expect(current.syncedAt).not.toBe("");
  });
  it("does not issue duplicate refreshes while a request is pending", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    await mount();
    await act(async () => {
      void current.refresh(true);
      void current.refresh(true);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => resolve(new Response(JSON.stringify(payload))));
    expect(current.loading).toBe(false);
  });
  it("redirects expired sessions to login", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 401 })),
    );
    await mount();
    expect(assign).toHaveBeenCalledWith("/login");
  });
  it("aborts pending work on unmount", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      }),
    );
    await mount();
    await act(async () => root!.unmount());
    root = undefined;
    expect(signal?.aborted).toBe(true);
  });
});
