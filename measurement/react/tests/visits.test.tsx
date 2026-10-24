// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { VisitsPage, TYPES, type Visit, type BoardClient } from "../src/visits";
import { focusOf, notificationHash } from "../src/navigation";

let host: HTMLDivElement, root: Root;
function visit(id: string, type: Visit["type"], status = "requested"): Visit {
  return {
    id,
    type,
    status,
    date: "2099-11-10",
    givenDate: "2099-11-10",
    note: "",
    revisit: false,
    reason: "",
    fault: "",
    createdAt: "2026-10-24T00:00:00Z",
    checklist: {},
    snags: [],
    photos: [],
    fields: {},
  };
}
function client(visits: Visit[]): BoardClient {
  return {
    id: "synthetic",
    name: "Synthetic client",
    city: "Delhi",
    visits,
    budget: { visits: null, rate: null, used: 0, over: 0, overAmount: null },
  };
}
async function mount(
  clients: BoardClient[],
  focus = "",
  focusType?: Visit["type"],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            role: "admin",
            settings: {
              team: [],
              checklists: { eptMarking: [], eptVerification: [], pdi: [] },
              pdiFields: [],
            },
            clients,
          }),
        ),
    ),
  );
  await act(async () =>
    root.render(
      <VisitsPage page="visits" focus={focus} focusType={focusType} />,
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("limits each visit column to four cards and expands that column independently", async () => {
  await mount([
    client(
      TYPES.flatMap(([type]) =>
        Array.from({ length: 6 }, (_, i) => visit(type + i, type)),
      ),
    ),
  ]);
  const columns = [...host.querySelectorAll(".vcol")];
  expect(columns).toHaveLength(4);
  for (const col of columns)
    expect(col.querySelectorAll(".vcard")).toHaveLength(4);
  const more = columns[0].querySelector(".vmore") as HTMLButtonElement;
  expect(more.textContent).toBe("Show more (2)");
  await act(async () => more.click());
  expect(more.getAttribute("aria-expanded")).toBe("true");
  expect(columns[0].querySelectorAll(".vcard")).toHaveLength(6);
  expect(columns[1].querySelectorAll(".vcard")).toHaveLength(4);
  await act(async () => more.click());
  expect(columns[0].querySelectorAll(".vcard")).toHaveLength(4);
  expect(host.textContent).not.toContain("New visit");
});
it("opens the visit type named in the notification even when another visit is newer", async () => {
  await mount(
    [
      client([
        visit("ept", "eptMarking"),
        { ...visit("pdi", "pdi"), createdAt: "2099-01-01T00:00:00Z" },
      ]),
    ],
    "synthetic",
    "eptMarking",
  );
  expect(host.querySelector("dialog")?.getAttribute("aria-label")).toBe(
    "EPT marking · Synthetic client",
  );
});
it("shows a cancelled first measurement as a request and keeps its date when other visits exist", async () => {
  const c = client([
    visit("old", "first", "cancelled"),
    visit("ept", "eptMarking"),
  ]);
  c.measurement = {
    requestedAt: "2026-10-24T00:00:00Z",
    date: "2099-11-12",
    by: "Design",
  };
  await mount([c]);
  const request = host.querySelector(".vcard-request") as HTMLButtonElement;
  expect(request).not.toBeNull();
  await act(async () => request.click());
  expect(
    (host.querySelector('dialog input[type="date"]') as HTMLInputElement).value,
  ).toBe("2099-11-12");
});
it("preserves encoded client IDs and visit types and ignores malformed links", () => {
  for (const [type, text] of [
    ["first", "First site measurement requested"],
    ["eptMarking", "EPT marking visit requested"],
    ["eptVerification", "EPT verification revisit requested"],
    ["pdi", "PDI visit requested"],
  ]) {
    expect(focusOf("#" + notificationHash("client /%", text))).toMatchObject({
      id: "client /%",
      type,
    });
  }
  expect(
    focusOf(
      "#" +
        notificationHash(
          "client",
          "Measurement needs site details: supervisor",
        ),
    ),
  ).toMatchObject({ id: "client", site: true });
  expect(focusOf("#crm/visits/client")).toMatchObject({ id: "client" });
  expect(focusOf("#crm/visits/%oops")).toEqual({ id: "" });
});
