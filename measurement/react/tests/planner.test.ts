import { describe, expect, it } from "vitest";
import { flagsOf, plan, type BoardClient, type Member } from "../src/visits";

const member = (id: string, extra: Partial<Member> = {}): Member => ({
  id,
  name: id,
  email: "",
  phone: "",
  skills: {
    first: "good",
    eptMarking: "good",
    eptVerification: "good",
    pdi: "good",
  },
  ncrOnly: false,
  active: true,
  ...extra,
});
const client = (
  id: string,
  city: string,
  state: string,
  visits: BoardClient["visits"] = [],
): BoardClient => ({
  id,
  name: id,
  city,
  state,
  visits,
  budget: { visits: null, rate: null, used: 0, over: 0, overAmount: null },
});
const visit = (id: string, who: string, date: string) => ({
  id,
  type: "first" as const,
  status: "assigned",
  date,
  note: "",
  revisit: false,
  reason: "",
  fault: "",
  assigneeId: who,
  assigneeName: who,
  createdAt: "",
  checklist: {},
  snags: [],
  photos: [],
  fields: {},
});
const settings = (team: Member[]) => ({
  team,
  checklists: { eptMarking: [], eptVerification: [], pdi: [] },
  pdiFields: [],
});

describe("who to send (synthetic)", () => {
  it("suggests the person already travelling to a nearby state, with a note", () => {
    const jaipur = client("j", "Jaipur", "Rajasthan", [
      visit("v1", "harish", "2026-11-05"),
    ]);
    const udaipur = client("u", "Udaipur", "Rajasthan");
    const picks = plan(
      {
        settings: settings([member("saurabh"), member("harish")]),
        clients: [jaipur, udaipur],
      },
      udaipur,
      "first",
      "2026-11-06",
    );
    expect(picks[0].m.id).toBe("harish");
    expect(picks[0].trip).toContain("Jaipur");
  });
  it("puts someone busy elsewhere that day last and never sends NCR-only people outstation", () => {
    const delhi = client("d", "Delhi", "Delhi", [
      visit("v1", "a", "2026-11-06"),
    ]);
    const pune = client("p", "Pune", "Maharashtra");
    const picks = plan(
      {
        settings: settings([
          member("a"),
          member("b"),
          member("c", { ncrOnly: true }),
        ]),
        clients: [delhi, pune],
      },
      pune,
      "first",
      "2026-11-06",
    );
    expect(picks.map((p) => p.m.id)).toEqual(["b", "a"]);
    expect(picks[1].free).toBe(false);
  });
  it("leaves out people graded poor or not graded", () => {
    const site = client("s", "Gurugram", "Haryana");
    const picks = plan(
      {
        settings: settings([
          member("x", {
            skills: {
              first: "poor",
              eptMarking: "",
              eptVerification: "",
              pdi: "",
            },
          }),
        ]),
        clients: [site],
      },
      site,
      "first",
      "2026-11-06",
    );
    expect(picks).toHaveLength(0);
  });
});

describe("hard-date flags (synthetic)", () => {
  it("flags a far site with no trip nearby, and an assignee busy elsewhere that day", () => {
    const delhi = client("d", "Delhi", "Delhi", [
      visit("v1", "a", "2099-11-06"),
    ]);
    const kochi = client("k", "Kochi", "Kerala", [
      { ...visit("v2", "a", "2099-11-06") },
    ]);
    const board = {
      settings: settings([member("a")]),
      clients: [delhi, kochi],
    };
    const texts = flagsOf(board, kochi, kochi.visits![0]).map((f) => f.text);
    expect(texts).toContain("Hard date · a busy in Delhi that day");
    expect(texts).toContain("Hard date · far, no trip nearby");
  });
  it("says nobody is free, and turns green when someone is on a trip nearby", () => {
    const jaipur = client("j", "Jaipur", "Rajasthan", [
      visit("v1", "harish", "2099-11-05"),
    ]);
    const open = {
      ...visit("v2", "", "2099-11-06"),
      status: "requested",
      assigneeId: undefined,
    };
    const udaipur = client("u", "Udaipur", "Rajasthan", [open]);
    const board = {
      settings: settings([member("harish")]),
      clients: [jaipur, udaipur],
    };
    expect(flagsOf(board, udaipur, open)).toEqual([
      { tone: "green", text: "harish is on the Jaipur trip · 5 Nov" },
    ]);
    const sameDay = { ...open, date: "2099-11-05" };
    const busyBoard = {
      ...board,
      clients: [jaipur, client("p", "Pune", "Maharashtra", [sameDay])],
    };
    expect(
      flagsOf(busyBoard, busyBoard.clients[1], sameDay).map((f) => f.text),
    ).toEqual([
      "Hard date · nobody free that day",
      "Hard date · far, no trip nearby",
    ]);
  });
  it("gives done visits no flags", () => {
    const site = client("s", "Kochi", "Kerala");
    const done = { ...visit("v", "a", "2000-01-01"), status: "done" };
    expect(
      flagsOf(
        { settings: settings([member("a")]), clients: [site] },
        site,
        done,
      ),
    ).toEqual([]);
  });
});
