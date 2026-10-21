// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { install, client, fixture, legacy } from "./setup";
import {
  analysis,
  stats,
  verdict,
  liveClients,
  forPerson,
  overview,
  clientRows,
  inRange,
  group,
} from "../src/model";
import { normalize } from "../src/data";
let old: ReturnType<typeof legacy>;
beforeAll(() => {
  old = legacy(install());
});
afterEach(() => vi.useRealTimers());
it.each(["all", "month", "lastMonth", "week"] as const)(
  "matches every legacy report calculation for %s",
  (range) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const all = fixture().filter((c) => c.stage !== "bin");
    expect(analysis(all, range)).toEqual(old.referenceAnalysis(all, range));
  },
);
it("matches all legacy person metrics and verdicts", () => {
  const live = liveClients(fixture());
  for (const person of window.People.list) {
    const value = stats(person, live);
    expect(value).toEqual(old.referenceStats(person, live));
    expect(verdict(value)).toEqual(old.referenceVerdict(value));
  }
});
it.each([
  [0, "On track"],
  [0.09, "On track"],
  [0.1, "Watch"],
  [0.29, "Watch"],
  [0.3, "Lagging"],
  [1, "Lagging"],
] as const)("keeps verdict boundary %s", (share, label) => {
  const mine = Array.from({ length: 100 }, () => client());
  expect(verdict({ mine, problems: share * 100 })[0]).toBe(label);
});
it("keeps post-design and lost out of live reports but in full analysis", () => {
  const all = fixture().filter((c) => c.stage !== "bin");
  expect(liveClients(all).map((c) => c.stage)).toEqual([
    "qualified",
    "design",
    "booked",
    "booked",
  ]);
  expect(analysis(all, "all").all.length).toBe(6);
  expect(
    analysis(all, "all").stages.find((r) => r.label === "Moved to post-design")
      ?.value,
  ).toBe(1);
});
it("excludes unconfirmed receipts and keeps totals and booking balances", () => {
  const all = fixture();
  const m = overview(liveClients(all));
  expect(m.got).toBe(40000);
  expect(m.left).toBe(78000);
  expect(analysis(all, "all").got).toBe(40000);
});
it("keeps person filtering separate from whole-team comparison", () => {
  const live = liveClients(fixture());
  expect(forPerson(live, "lang").every((c) => c.owner === "lang")).toBe(true);
  expect(forPerson(live, "")).toEqual(live);
  expect(stats(window.People.list[0], live).mine.length).toBe(2);
});
it("handles empty report denominators without NaN", () => {
  const result = analysis([], "all");
  expect(result.keptPct).toBeNull();
  expect(result.revisionsPerApproval).toBeNull();
  expect(result.got).toBe(0);
  expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  expect(verdict({ mine: [], problems: 0 })).toEqual(["On track", "green", 0]);
});
it("filters client stages and problems in severity order", () => {
  const all = liveClients(fixture()),
    rows = clientRows(all, "", "yes");
  expect(rows.every((r) => r.f.length)).toBe(true);
  expect(rows.map((r) => r.rank)).toEqual(rows.map((r) => r.rank).sort());
  expect(clientRows(all, "design", "").map((r) => r.c.stage)).toEqual([
    "design",
  ]);
});
it("applies Monday/week and previous-month boundaries including year rollover", () => {
  const now = new Date(2026, 0, 5, 12);
  for (const [date, range, expected] of [
    ["2026-01-05", "week", true],
    ["2026-01-04", "week", false],
    ["2025-12-31", "lastMonth", true],
    ["2026-01-01", "lastMonth", false],
    ["2026-01-06", "month", false],
  ] as const) {
    expect(inRange(client("date", { receivedAt: date }), range, now)).toBe(
      expected,
    );
  }
});
it("groups arbitrary source labels safely, including object property names", () => {
  const all = [
    client("a", { source: "__proto__" }),
    client("b", { source: "constructor" }),
    client("c", { source: "" }),
  ];
  expect(group(all, (c) => c.source).map((g) => g.key)).toEqual([
    "__proto__",
    "constructor",
    "Not set",
  ]);
});
it("normalization and calculations never mutate the raw snapshot", () => {
  const raw = { rev: 1, clients: fixture() },
    before = JSON.stringify(raw);
  const normalized = normalize(raw);
  analysis(normalized.clients, "all");
  stats(window.People.list[0], liveClients(normalized.clients));
  expect(JSON.stringify(raw)).toBe(before);
});
it("limits revision report to top seven without losing total revisions", () => {
  const c = client();
  c.design.revisions = Array.from({ length: 9 }, (_, i) => ({
    reason: "Reason " + i,
  }));
  const result = analysis([c], "all");
  expect(result.reasons.length).toBe(7);
  expect(result.totalRev).toBe(9);
});
