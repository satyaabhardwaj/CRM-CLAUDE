// @vitest-environment jsdom
// Session end mid-save in Accounts: the changed client is kept and saved once after sign-in.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { installRules, client, payment } from "./setup";
import { useStore, transact, SessionEndedWithDraft } from "../src/store";
import { record, type Store } from "../src/model";
import { resetSessionEnded } from "../../../shared/session";
beforeAll(() => {
  installRules();
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
let root: Root | null = null,
  host: HTMLDivElement;
beforeEach(() => {
  sessionStorage.clear();
  resetSessionEnded();
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});
function server(initial: Store, expired = () => false) {
  const state = { store: structuredClone(initial), puts: [] as Store[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (expired()) return new Response("{}", { status: 401 });
      if (url === "/api/auth/me")
        return new Response('{"id":"u1","role":"admin"}');
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        state.puts.push(body);
        state.store = { ...body, rev: body.rev + 1 };
        return new Response(JSON.stringify({ rev: state.store.rev }));
      }
      return new Response(JSON.stringify(state.store));
    }),
  );
  return state;
}
let hook: ReturnType<typeof useStore>;
function Harness() {
  hook = useStore(false);
  return null;
}
async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness />));
  await act(async () => {});
}

it("a save cut off by the end of the session carries the changed client", async () => {
  server({ rev: 1, clients: [client()] }, () => true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response("{}", { status: 401 })
        : new Response(JSON.stringify({ rev: 1, clients: [client()] })),
    ),
  );
  const error = await transact("synthetic-a", "op-1", (c) =>
    record(c, payment()),
  ).catch((e) => e);
  expect(error).toBeInstanceOf(SessionEndedWithDraft);
  expect(error.id).toBe("synthetic-a");
  expect(error.draft.after.payment.receipts).toHaveLength(1);
});

it("keeps the payment and saves it once after signing in again", async () => {
  let expired = false;
  const assign = vi.fn();
  vi.stubGlobal("location", {
    ...location,
    assign,
    pathname: "/accounts/",
    search: "",
    hash: "#booking",
  });
  const first = server({ rev: 1, clients: [client()] }, () => expired);
  await mount();
  expired = true;
  await act(async () => {
    await hook.save("synthetic-a", "op-1", (c) => record(c, payment()));
  });
  expect(assign).toHaveBeenCalledWith(
    "/login?reason=ended&next=%2Faccounts%2F%23booking",
  );
  expect(Object.keys(sessionStorage)).toEqual([
    "crm.draft.u1.accounts.synthetic-a",
  ]);
  expect(first.puts).toHaveLength(0);
  await act(async () => root!.unmount());
  root = null;

  const second = server(first.store);
  await mount();
  await vi.waitFor(() => expect(second.puts).toHaveLength(1));
  expect(second.store.clients[0].payment.receipts).toHaveLength(1);
  expect(sessionStorage.length).toBe(0);
  await vi.waitFor(() =>
    expect(hook.notice).toContain("saved after signing in"),
  );
});
