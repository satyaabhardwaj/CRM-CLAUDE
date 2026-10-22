// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  safeNext,
  loginUrl,
  keepDrafts,
  readDrafts,
  clearDrafts,
  replay,
  changedRecords,
} from "../../../shared/session";
import { afterSignIn, Login } from "../src/Auth";
import { SessionGuard } from "../src/SessionGuard";
import { signOut } from "../src/api";

let root: Root, host: HTMLDivElement;
beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => sessionStorage.clear());
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(node));
}

describe("next after sign-in", () => {
  it.each([
    "/sales/",
    "/sales/#qualified",
    "/design/?tab=pre#make",
    "/accounts/#summary",
    "/management/",
  ])("accepts the same-site path %s", (path) => {
    expect(safeNext(path)).toBe(path);
  });
  it.each([
    "",
    "sales/",
    "//evil.example/",
    "/\\evil.example",
    "\\\\evil.example",
    "https://evil.example/",
    "javascript:alert(1)",
    "/%2F%2Fevil.example",
    "/%2f/evil.example",
    "%2F%2Fevil.example",
    "/%5Cevil.example",
    "/%252F%252Fevil.example",
    "/sales/\nSet-Cookie:x",
    "/%0d%0aLocation:evil",
    "/javascript:alert(1)",
    "/" + "a".repeat(2001),
    "/%E0%A4%A",
  ])("refuses %j", (path) => {
    expect(safeNext(path)).toBeNull();
  });
  it("falls back to the workspace for a missing or unsafe next", () => {
    expect(afterSignIn("")).toBe("/");
    expect(afterSignIn("?next=%2F%2Fevil.example")).toBe("/");
    expect(afterSignIn("?next=https%3A%2F%2Fevil.example")).toBe("/");
    expect(afterSignIn("?next=%2Fdesign%2F%23post")).toBe("/design/#post");
  });
  it("builds the sign-in link with the current page", () => {
    expect(
      loginUrl("ended", { pathname: "/sales/", search: "", hash: "#booked" }),
    ).toBe("/login?reason=ended&next=%2Fsales%2F%23booked");
    expect(loginUrl("idle", { pathname: "/", search: "", hash: "" })).toBe(
      "/login?reason=idle",
    );
    expect(
      loginUrl("ended", { pathname: "/login", search: "?next=/x", hash: "" }),
    ).toBe("/login?reason=ended");
  });
  it("tells the person why they are on the sign-in page", async () => {
    vi.stubGlobal("location", {
      ...location,
      search: "?reason=ended&next=%2Fsales%2F",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    await render(<Login />);
    expect(host.textContent).toContain("Session ended — sign in again.");
  });
  it("returns to that page after signing in", async () => {
    vi.stubGlobal("location", {
      ...location,
      search: "?reason=ended&next=%2Faccounts%2F%23summary",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 401 }))
        .mockResolvedValueOnce(new Response('{"ok":true}')),
    );
    const navigate = vi.fn();
    await render(<Login navigate={navigate} />);
    await act(async () =>
      host
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(navigate).toHaveBeenCalledWith("/accounts/#summary");
  });
});

describe("drafts", () => {
  const a = { id: "c1", name: "One", v: 1 },
    b = { id: "c2", name: "Two", v: 1 };
  it("are kept per user, module and client, and cleared on sign-out", async () => {
    keepDrafts("u1", "sales", { c1: { before: a, after: { ...a, v: 2 } } });
    keepDrafts("u2", "sales", { c1: { before: a, after: { ...a, v: 9 } } });
    keepDrafts("u1", "design", { c2: { before: b, after: { ...b, v: 3 } } });
    expect(Object.keys(sessionStorage).sort()).toEqual([
      "crm.draft.u1.design.c2",
      "crm.draft.u1.sales.c1",
      "crm.draft.u2.sales.c1",
    ]);
    expect(readDrafts("u1", "sales")).toEqual({
      c1: { before: a, after: { ...a, v: 2 } },
    });
    clearDrafts("u1", "sales");
    expect(readDrafts("u1", "sales")).toEqual({});
    expect(readDrafts("u2", "sales").c1.after).toEqual({ ...a, v: 9 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await signOut();
    expect(sessionStorage.length).toBe(0);
  });
  it("hold no session cookie or password", () => {
    keepDrafts("u1", "sales", { c1: { before: a, after: a } });
    const raw = JSON.stringify(sessionStorage);
    expect(raw).not.toMatch(/crm_session|password/i);
  });
  it("replay on the newest copy and never overwrite a record changed meanwhile", () => {
    const drafts = changedRecords(
      [a, b],
      [
        { ...a, v: 2 },
        { ...b, v: 2 },
      ],
    );
    const latest = [a, { ...b, v: 5 }];
    const result = replay(latest, drafts);
    expect(result.applied).toEqual(["c1"]);
    expect(result.conflicts).toEqual(["c2"]);
    expect(result.records).toEqual([
      { ...a, v: 2 },
      { ...b, v: 5 },
    ]);
    const added = replay([a], {
      c9: { before: undefined, after: { id: "c9", name: "New", v: 1 } },
    });
    expect(added.records.map((c) => c.id)).toEqual(["c1", "c9"]);
  });
});

describe("Stay signed in", () => {
  const T0 = 1_800_000_000;
  type Handler = (url: string, now: number) => Response;
  const times = (idle: number, max: number, now: number) =>
    new Response(
      JSON.stringify({ idle_expires_at: idle, expires_at: max, now }),
    );
  async function mount(handler: Handler) {
    let time = T0 * 1000;
    const clock = () => time;
    const fetcher = vi
      .fn()
      .mockImplementation(async (url: string) =>
        handler(url, Math.floor(time / 1000)),
      );
    vi.stubGlobal("fetch", fetcher);
    const navigate = vi.fn();
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    await render(<SessionGuard clock={clock} navigate={navigate} />);
    const advance = async (seconds: number) => {
      for (let i = 0; i < seconds; i++) {
        time += 1000;
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
      }
    };
    return { navigate, advance, fetcher };
  }
  const dialog = () => host.querySelector("dialog")!;
  const pings = (fetcher: ReturnType<typeof vi.fn>) =>
    fetcher.mock.calls.filter(([url]) => url === "/api/auth/activity").length;

  it("warns two minutes before the idle limit, and Escape dismisses", async () => {
    const { advance } = await mount((_, now) =>
      times(T0 + 600, T0 + 43200, now),
    );
    await advance(470);
    expect(dialog().textContent).toBe("");
    await advance(15);
    expect(dialog().getAttribute("role")).toBe("alertdialog");
    expect(dialog().textContent).toContain("Still there?");
    expect(dialog().textContent).toContain("Unsaved changes are kept");
    expect(document.activeElement?.textContent).toBe("Stay signed in");
    await act(async () =>
      dialog().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(dialog().textContent).toBe("");
  });

  it("Stay signed in tells the server and moves the limit", async () => {
    let idle = T0 + 300;
    const { navigate, advance, fetcher } = await mount((url, now) => {
      if (url === "/api/auth/activity") idle = now + 14400;
      return times(idle, T0 + 43200, now);
    });
    await advance(190);
    const stay = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Stay signed in",
    )!;
    await act(async () => stay.click());
    expect(pings(fetcher)).toBe(1);
    expect(dialog().textContent).toBe("");
    await advance(200);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs out an idle tab and comes back to the same page after sign-in", async () => {
    vi.stubGlobal("location", {
      ...location,
      pathname: "/design/",
      search: "",
      hash: "#post",
    });
    const { navigate, advance } = await mount((_, now) =>
      now >= T0 + 200
        ? new Response("{}", { status: 401 })
        : times(T0 + 200, T0 + 43200, now),
    );
    await advance(205);
    expect(navigate).toHaveBeenCalledWith(
      "/login?reason=idle&next=%2Fdesign%2F%23post",
    );
  });

  it("only real use pings the server, at most once a minute", async () => {
    const { advance, fetcher } = await mount((_, now) =>
      times(now + 14400, T0 + 43200, now),
    );
    await advance(90);
    expect(pings(fetcher)).toBe(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await advance(1);
    window.dispatchEvent(new MouseEvent("pointerdown"));
    await advance(30);
    expect(pings(fetcher)).toBe(1);
  });

  it("at the 12-hour limit explains it and offers no extension", async () => {
    const { advance } = await mount((_, now) =>
      times(T0 + 14400, T0 + 100, now),
    );
    await advance(5);
    expect(dialog().textContent).toContain("every sign-in ends after 12 hours");
    expect(host.textContent).not.toContain("Stay signed in");
  });
});
