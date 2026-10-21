import type { Client, Person, Range } from "./types";
export const K = () => window.Kit,
  L = () => window.SalesLogic,
  S = () => window.Signals;
export const sum = <T>(list: T[], fn: (x: T) => number) =>
  list.reduce((total, x) => total + fn(x), 0);
export const owner = (c: Client) => c.owner || window.People.list[0].id;
export const short = (v?: string) =>
  v
    ? K()
        .day(v)
        .replace(/ \d{4}$/, "")
    : "";
export const ago = (ms: number) => {
  if (!Number.isFinite(ms)) return "No activity";
  const hours = (Date.now() - ms) / 3600000;
  return hours < 1 ? "just now" : K().span(hours) + " ago";
};
const rank: Record<string, number> = { red: 0, yellow: 1, blue: 2 };
export const worst = (c: Client) =>
  S()
    .flags(c)
    .slice()
    .sort((a, b) => rank[a[1]] - rank[b[1]]);
export const liveClients = (all: Client[]) =>
  all.filter((c) => S().LIVE.includes(c.stage));
export const forPerson = (all: Client[], who: string) =>
  all.filter((c) => !who || owner(c) === who);
export function stats(p: Person, live: Client[]) {
  const mine = forPerson(live, p.id),
    cash = mine.filter((c) => ["token", "booked"].includes(c.stage)),
    booked = mine.filter((c) => c.stage === "booked");
  return {
    mine,
    notCalled: mine.filter((c) => c.stage === "qualified" && !c.spokeAt).length,
    broken: mine.filter(
      (c) => (c.stage === "qualified" && L().firstCall(c).late) || c.missed24,
    ).length,
    late: mine.filter((c) => c.nextFollowUp && c.nextFollowUp < K().today())
      .length,
    sitting: mine.filter(
      (c) =>
        c.stage === "design" &&
        (c.design.step === "toShare" || (c.design.step || "drf") === "drf") &&
        K().daysSince(c.design.stepAt) >= 1,
    ).length,
    calls: sum(mine, (c) => c.contacts.length),
    revisions: sum(mine, (c) => c.design.revisions.length),
    bookedCount: booked.length,
    bookedValue: sum(booked, (c) => L().totals(c).total),
    got: sum(cash, L().collected),
    left: sum(cash, L().bookingLeft),
    problems: mine.filter((c) =>
      S()
        .flags(c)
        .some((f) => f[1] === "red"),
    ).length,
    touched: mine.length ? Math.max(...mine.map(S().lastTouch)) : 0,
  };
}
export type Stats = ReturnType<typeof stats>;
export function verdict(
  s: Pick<Stats, "mine" | "problems">,
): [string, string, number] {
  const share = s.mine.length ? s.problems / s.mine.length : 0;
  return [
    share >= 0.3 ? "Lagging" : share >= 0.1 ? "Watch" : "On track",
    share >= 0.3 ? "red" : share >= 0.1 ? "yellow" : "green",
    share,
  ];
}
export function clientRows(shown: Client[], stage: string, only: string) {
  return shown
    .filter(
      (c) => (!stage || c.stage === stage) && (!only || S().flags(c).length),
    )
    .map((c) => {
      const f = worst(c);
      return { c, f, rank: f.length ? rank[f[0][1]] : 3 };
    })
    .sort((a, b) => a.rank - b.rank || S().lastTouch(a.c) - S().lastTouch(b.c));
}
export function overview(shown: Client[]) {
  const cash = shown.filter((c) => ["token", "booked"].includes(c.stage)),
    troubled = shown
      .filter((c) => S().flags(c).length)
      .sort(
        (a, b) =>
          rank[worst(a)[0][1]] - rank[worst(b)[0][1]] ||
          S().value(b) - S().value(a),
      );
  return {
    value: sum(shown, S().value),
    orders: shown.filter((c) => c.stage !== "qualified").length,
    got: sum(cash, L().collected),
    left: sum(cash, L().bookingLeft),
    owing: cash.filter((c) => L().bookingLeft(c) > 0).length,
    troubled,
    redCount: troubled.filter((c) => worst(c)[0][1] === "red").length,
    waiting: ["Sales", "Design", "Client", "Accounts"].map((name) => {
      const list = shown.filter((c) => S().ball(c)[0] === name);
      return {
        name,
        count: list.length,
        days: list.length
          ? Math.round(sum(list, (c) => S().ball(c)[1]) / list.length)
          : 0,
      };
    }),
  };
}
export function inRange(c: Client, range: Range, now = new Date()) {
  if (range === "all") return true;
  const got = K().ymd(new Date(c.receivedAt));
  let from = K().ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
    to = K().ymd(now);
  if (range === "lastMonth") {
    from = K().ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    to = K().ymd(new Date(now.getFullYear(), now.getMonth(), 0));
  }
  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    from = K().ymd(start);
  }
  return got >= from && got <= to;
}
export function group(
  list: Client[],
  keyOf: (c: Client) => string | undefined,
) {
  const map = new Map<string, Client[]>();
  for (const c of list) {
    const key = keyOf(c) || "Not set";
    map.set(key, [...(map.get(key) || []), c]);
  }
  return [...map].map(([key, list]) => ({ key, list }));
}
export interface Bar {
  label: string;
  value: number;
  text: string;
  bad?: boolean;
  tip?: string;
}
export const one = (v: number | null) =>
  v == null ? "No data yet" : String(Math.round(v * 10) / 10);
export const avg = (list: number[]) =>
  list.length ? sum(list, (x) => x) / list.length : null;
const days = (a: string | undefined, b: string | undefined) =>
  (Date.parse(b || "") - Date.parse(a || "")) / 86400000;
export function analysis(mine: Client[], range: Range) {
  const all = mine.filter((c) => inRange(c, range)),
    live = liveClients(all),
    by = (stage: string) => all.filter((c) => c.stage === stage),
    cash = [...by("token"), ...by("booked")],
    line = (list: Client[]) =>
      K().short(sum(list, S().value)) + " (" + list.length + ")";
  const stages: Bar[] = [
    ["qualified", "Qualified"],
    ["design", "In design"],
    ["booked", "Booked"],
    ["post", "Moved to post-design"],
    ["lost", "Disqualified"],
  ].map(([stage, label]) => {
    const list = by(stage);
    return {
      label,
      value: list.length,
      text: ["qualified", "lost"].includes(stage)
        ? "(" + list.length + ")"
        : line(list),
      bad: stage === "lost",
      tip:
        label +
        ": " +
        list.length +
        " client(s), " +
        K().money(sum(list, S().value)),
    };
  });
  const reached = all.filter((c) =>
      ["token", "booked", "post"].includes(c.stage),
    ).length,
    firstTalk = all
      .filter(
        (c) => c.spokeAt && Date.parse(c.spokeAt) >= Date.parse(c.receivedAt),
      )
      .map((c) => days(c.receivedAt, c.spokeAt) * 24),
    judged = all.filter((c) => c.spokeAt || L().firstCall(c).late),
    kept = judged.filter(
      (c) => c.spokeAt && !c.missed24 && days(c.receivedAt, c.spokeAt) <= 1,
    ).length,
    toProposal = all
      .filter((c) => c.design.sentAt && c.design.proposals[0])
      .map((c) => days(c.design.sentAt, c.design.proposals[0].receivedAt))
      .filter((d) => d >= 0),
    toYes = all
      .filter((c) => c.approvedAt && c.design.proposals[0])
      .map((c) => days(c.design.proposals[0].receivedAt, c.approvedAt))
      .filter((d) => d >= 0),
    toToken = all
      .filter((c) => c.approvedAt && c.bookedAt)
      .map((c) => days(c.approvedAt, c.bookedAt))
      .filter((d) => d >= 0),
    approved = all.filter((c) => c.approvedAt),
    keptPct = judged.length ? Math.round((kept / judged.length) * 100) : null;
  const due = sum(cash, L().bookingDue),
    got = sum(cash, L().collected),
    left = sum(cash, L().bookingLeft),
    waiting = by("booked").filter((c) => !L().tokenIn(c));
  const ages: [string, number, number][] = [
    ["0 to 1 day", 0, 1],
    ["2 to 3 days", 2, 3],
    ["4 days or more", 4, 9999],
  ];
  const age: Bar[] = ages.map(([label, min, max]) => {
    const list = waiting.filter((c) => {
      const d = K().daysSince(c.approvedAt);
      return d >= min && d <= max;
    });
    return {
      label,
      value: sum(list, L().bookingDue),
      text: K().short(sum(list, L().bookingDue)) + " (" + list.length + ")",
      bad: min >= 4,
    };
  });
  const people: Bar[] = window.People.list
    .map((p) => {
      const list = forPerson(live, p.id);
      return {
        label: p.name,
        value: sum(list, S().value),
        text: line(list.filter((c) => c.stage !== "qualified")),
        tip:
          p.role +
          " " +
          p.name +
          ": " +
          list.length +
          " clients, collected " +
          K().money(sum(list, L().collected)),
      };
    })
    .sort((a, b) => b.value - a.value);
  const source = (
    items: Client[],
    key: (c: Client) => string | undefined,
    psm = false,
  ): Bar[] =>
    group(items, key)
      .map((g) => {
        const won = g.list.filter((c) =>
          ["token", "booked", "post"].includes(c.stage),
        ).length;
        return {
          label: g.key,
          value: g.list.length,
          text: g.list.length + " leads · " + won + " approved",
          tip: psm
            ? "PSM " +
              g.key +
              ": " +
              K().money(sum(g.list, S().value)) +
              " in orders"
            : g.key +
              ": " +
              g.list.length +
              " leads, " +
              won +
              " approved, " +
              K().money(sum(g.list, S().value)),
        };
      })
      .sort((a, b) => b.value - a.value);
  const sources = source(all, (c) => c.source),
    psms = source(
      all.filter((c) => c.psm),
      (c) => c.psm,
      true,
    ),
    designers: Bar[] = group(
      all.filter((c) => c.design.designer),
      (c) => c.design.designer,
    )
      .map((g) => {
        const made = sum(g.list, (c) => c.design.proposals.length),
          revised = sum(g.list, (c) => c.design.revisions.length);
        return {
          label: g.key,
          value: made,
          text: made + " proposals · " + revised + " revised",
          tip: "Designer " + g.key + ": " + g.list.length + " client(s)",
        };
      })
      .sort((a, b) => b.value - a.value);
  const why = new Map<string, number>();
  all.forEach((c) =>
    c.design.revisions.forEach((r) =>
      why.set(r.reason, (why.get(r.reason) || 0) + 1),
    ),
  );
  const reasons: Bar[] = [...why]
      .map(([label, value]) => ({ label, value, text: String(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7),
    totalRev = sum(all, (c) => c.design.revisions.length);
  return {
    all,
    stages,
    reached,
    firstTalk,
    judged,
    kept,
    keptPct,
    toProposal,
    toYes,
    toToken,
    approved,
    revisionsPerApproval: approved.length
      ? sum(approved, (c) => c.design.revisions.length) / approved.length
      : null,
    due,
    got,
    left,
    cash,
    age,
    people,
    sources,
    psms,
    designers,
    reasons,
    totalRev,
  };
}
