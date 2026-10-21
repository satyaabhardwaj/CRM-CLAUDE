import { describe, it, expect } from "vitest";
// The production adapter intentionally reuses the previously tested deterministic selectors.
// @ts-expect-error Legacy module is typed at the adapter boundary.
import model from "../../common/source-model.js";
import { adapt, count, select, csvText, route, validDate } from "../src/model";
const now = new Date(2026, 9, 19, 12);
const make = (overrides: Record<string, unknown> = {}) =>
  adapt(
    {
      id: "a",
      stage: "First Measurement",
      client: "Client",
      status: "To Schedule",
      date: "2026-10-18",
      assigned_person: "Measurer",
      owner: "Salesperson",
      modified_at: "2026-10-19T10:00:00Z",
      ...overrides,
    },
    now,
  );
describe("live Zoho adapter and preserved selectors", () => {
  it("keeps assigned person distinct from salesperson and normalizes completed status", () => {
    const r = make({ status: "Completed" });
    expect(r.status).toBe("Done");
    expect(r.late).toBe(false);
    expect(r.assignee).toBe("Measurer");
    expect(r.owner).toBe("Salesperson");
  });
  it("marks only valid past incomplete visits late", () => {
    expect(make().late).toBe(true);
    expect(make({ date: "2026-10-19" }).late).toBe(false);
    expect(make({ date: "2026-02-30" }).late).toBe(false);
    expect(validDate("2026-13-01")).toBe(false);
  });
  it("never substitutes inferred city coordinates", () => {
    expect(
      make({
        coordinates: [0, 0],
        map_coordinates: [28, 77],
        map_location_kind: "city",
      }).coordinates,
    ).toBeNull();
    expect(make({ coordinates: [0, 77] }).coordinates).toEqual([0, 77]);
    expect(make({ coordinates: [95, 77] }).coordinates).toBeNull();
  });
  it("deduplicates IDs, filters stages, and reconciles status counts", () => {
    const records = [
      make(),
      make(),
      make({ id: "b", status: "Completed" }),
      make({ id: "c", stage: "PDI", status: "Scheduled", date: "2026-10-20" }),
    ];
    const result = select(records, model.defaults(), "all", model);
    expect(result).toHaveLength(3);
    expect(count(result)).toEqual({
      Open: 2,
      Scheduled: 1,
      "To Schedule": 1,
      Late: 1,
      Done: 1,
    });
    expect(
      select(records, { ...model.defaults(), status: "Open" }, "all", model),
    ).toHaveLength(2);
    expect(
      select(records, { ...model.defaults(), status: "Done" }, "all", model),
    ).toHaveLength(1);
    expect(select(records, model.defaults(), "pdi", model)).toHaveLength(1);
  });
  it("combines search, city, owner and date range without changing records", () => {
    const records = [
      make({ city: "Delhi" }),
      make({ id: "b", city: "Mumbai" }),
    ];
    expect(
      select(
        records,
        {
          ...model.defaults(),
          search: "client",
          city: "Delhi",
          owner: "Salesperson",
        },
        "all",
        model,
      ),
    ).toHaveLength(1);
    expect(records).toHaveLength(2);
    expect(model.inDateRange("2026-10-18T10:00:00", "Last 7 days", now)).toBe(
      true,
    );
    expect(model.inDateRange("2026-10-20T10:00:00", "Today", now)).toBe(false);
  });
  it("retains hash deep links and safely handles unknown routes", () => {
    expect(route("#pdi/requests")).toEqual({ tab: "pdi", page: "requests" });
    expect(route("#bad/wrong")).toEqual({ tab: "all", page: "overview" });
    expect(route("#ept-marking")).toEqual({
      tab: "ept-marking",
      page: "overview",
    });
  });
  it("escapes spreadsheet formulas, embedded quotes and multiline text", () => {
    expect(csvText([["=SUM(A1)", 'a"b', "line\nnext", 4]])).toBe(
      '\uFEFF"\'=SUM(A1)","a""b","line\nnext","4"',
    );
  });
  it("rejects invalid contracts instead of showing misleading zero counts", () => {
    expect(() => adapt(null)).toThrow();
    expect(() => adapt({ id: "a", stage: "Unknown" })).toThrow();
  });
});
