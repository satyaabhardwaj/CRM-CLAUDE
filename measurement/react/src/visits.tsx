// Measurement visits run by the CRM itself (Manish, 23 Oct 2026). The server is backend/measurement_visits.py.
// Pages: Visits board (the head's view), Revisit approvals (Founder's Office), Team & checklists.
// Nothing here is sample data: the team, checklists and visits start empty and are typed in by the team.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Dialog } from "./components";

export const TYPES = [
  ["first", "First measurement"],
  ["eptMarking", "EPT marking"],
  ["eptVerification", "EPT verification"],
  ["pdi", "PDI"],
] as const;
export type VisitType = (typeof TYPES)[number][0];
export const typeName = (t: string) => TYPES.find((x) => x[0] === t)?.[1] || t;
const GRADES = [
  ["", "Not graded"],
  ["poor", "Poor"],
  ["good", "Good"],
  ["excellent", "Excellent"],
] as const;
// Cities treated as NCR for the "NCR only" rule.
const NCR = [
  "delhi",
  "new delhi",
  "gurgaon",
  "gurugram",
  "noida",
  "greater noida",
  "ghaziabad",
  "faridabad",
];
export const isNcr = (city = "") => NCR.includes(city.trim().toLowerCase());
const SITE_ASK = [
  ["siteAddress", "site address"],
  ["clientPhone", "client number"],
  ["supervisor", "site supervisor"],
  ["supervisorPhone", "site supervisor number"],
] as const;

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  skills: Record<string, string>;
  ncrOnly: boolean;
  active: boolean;
}
export interface Item {
  id: string;
  text: string;
  photo?: boolean;
}
export interface Settings {
  team: Member[];
  checklists: { eptMarking: Item[]; eptVerification: Item[]; pdi: Item[] };
  pdiFields: Item[];
}
export interface Visit {
  id: string;
  type: VisitType;
  status: string;
  date: string;
  note: string;
  revisit: boolean;
  reason: string;
  fault: string;
  assigneeId?: string;
  assigneeName?: string;
  assistantId?: string;
  assistantName?: string;
  approval?: { status: string; at?: string; note?: string };
  createdAt: string;
  doneAt?: string;
  acceptedAt?: string;
  checklist: Record<string, { state: string; note: string; photo: string }>;
  snags: { text: string; fixed: boolean }[];
  photos: { name: string; at: string }[];
  fields: Record<string, string>;
  visitNote?: string;
  declineReason?: string;
  /** The date Sales or the designer asked for; another date goes through a special approval. */
  givenDate?: string;
  dateChange?: {
    status: string;
    from: string;
    to: string;
    reason: string;
    at: string;
    by?: string;
    decidedBy?: string;
    note?: string;
  };
  askedBy?: string;
  createdBy?: string;
  createdByName?: string;
  assignedBy?: string;
  assignedAt?: string;
}
export interface BoardClient {
  id: string;
  name: string;
  pid?: string;
  cid?: string;
  city?: string;
  state?: string;
  pin?: string;
  siteAddress?: string;
  siteContact?: string;
  phone?: string;
  stage?: string;
  owner?: string;
  docs?: Record<string, string>;
  design?: { designer?: string };
  site?: {
    location?: string;
    supervisor?: string;
    supervisorPhone?: string;
    clientPhone?: string;
  };
  siteAsk?: { at: string; by: string; missing: string[] };
  visits?: Visit[];
  measurement?: { requestedAt?: string; date?: string; by?: string };
  visitBudget?: { visits: number | null; rate: number | null };
  budget: {
    visits: number | null;
    rate: number | null;
    used: number;
    over: number;
    overAmount: number | null;
  };
}
interface Board {
  settings: Settings;
  clients: BoardClient[];
  role: string;
}

export async function api<T>(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401) {
    location.assign("/login");
    throw new Error("Signed out.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      (typeof data?.detail === "string" && data.detail) ||
        (typeof data?.error === "string" && data.error) ||
        "It did not save. Please try again.",
    );
  return data as T;
}

function useBoard(paused: boolean) {
  const [board, setBoard] = useState<Board | null>(null),
    [error, setError] = useState("");
  const pause = useRef(paused);
  pause.current = paused;
  const load = useCallback(async () => {
    try {
      setBoard(await api<Board>("/api/measurement/board"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load visits.");
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (!pause.current && document.visibilityState === "visible") void load();
    }, 30000);
    return () => clearInterval(t);
  }, [load]);
  return { board, error, load };
}

// Dates in the office's own time (India): toISOString would give yesterday's date before 5:30 am.
const ymd = (d: Date) =>
  d.getFullYear() +
  "-" +
  String(d.getMonth() + 1).padStart(2, "0") +
  "-" +
  String(d.getDate()).padStart(2, "0");
const today = () => ymd(new Date());
function addDays(day: string, n: number) {
  const d = new Date(day + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
}
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
// "2026-11-05" -> "5 Nov".
export const nice = (day = "") =>
  day
    ? Number(day.slice(8, 10)) + " " + MONTHS[Number(day.slice(5, 7)) - 1]
    : "";
// Monday-to-Sunday weeks.
function weekStart(ymd: string) {
  const d = new Date(ymd + "T00:00:00");
  return addDays(ymd, -((d.getDay() + 6) % 7));
}
function rangeOf(
  kind: string,
  from: string,
  to: string,
): [string, string] | null {
  const t = today();
  if (kind === "week") return [weekStart(t), addDays(weekStart(t), 6)];
  if (kind === "next")
    return [addDays(weekStart(t), 7), addDays(weekStart(t), 13)];
  if (kind === "month") return [t.slice(0, 8) + "01", t.slice(0, 8) + "31"];
  if (kind === "year")
    return [t.slice(0, 5) + "01-01", t.slice(0, 5) + "12-31"];
  if (kind === "custom" && from && to) return [from, to];
  return null;
}
const OPEN = ["requested", "assigned", "accepted"];
export const late = (v: Visit) =>
  OPEN.includes(v.status) && !!v.date && v.date < today();
const STATUS_TONE: Record<string, string> = {
  requested: "grey",
  assigned: "blue",
  accepted: "blue",
  declined: "red",
  done: "green",
  cancelled: "grey",
};
export function StatusPill({ v }: { v: Visit }) {
  return (
    <span
      className={"pill " + (late(v) ? "red" : STATUS_TONE[v.status] || "grey")}
    >
      {late(v) ? "Late" : v.status[0].toUpperCase() + v.status.slice(1)}
    </span>
  );
}
// The date Sales or the designer gave. First measurements made before 24 Oct 2026 take it from the request.
export const givenOf = (c: BoardClient, v: Visit) =>
  v.givenDate ??
  (v.type === "first" && !v.revisit ? c.measurement?.date || "" : "");
export function TypeChip({ type }: { type: string }) {
  return <span className={"vt vt-" + type}>{typeName(type)}</span>;
}
// Who to send: skilled enough (good or excellent) for this visit type, and not "NCR only" for a site outside NCR.
// The least busy go first. Poor or ungraded people only go along as assistants.
export function suggest(
  team: Member[],
  type: string,
  city: string,
  open: Record<string, number>,
) {
  const rank = { excellent: 2, good: 1 } as Record<string, number>;
  return team
    .filter(
      (m) => m.active && rank[m.skills[type]] && (!m.ncrOnly || isNcr(city)),
    )
    .sort(
      (a, b) =>
        rank[b.skills[type]] - rank[a.skills[type]] ||
        (open[a.id] || 0) - (open[b.id] || 0),
    );
}

// Neighbouring states, for planning trips (Manish, 24 Oct 2026: "same state or a state near it").
const NEAR: Record<string, string[]> = {
  rajasthan: [
    "gujarat",
    "madhya pradesh",
    "uttar pradesh",
    "haryana",
    "punjab",
    "delhi",
  ],
  gujarat: ["rajasthan", "madhya pradesh", "maharashtra"],
  maharashtra: [
    "gujarat",
    "madhya pradesh",
    "chhattisgarh",
    "telangana",
    "karnataka",
    "goa",
  ],
  haryana: [
    "delhi",
    "punjab",
    "rajasthan",
    "uttar pradesh",
    "himachal pradesh",
    "chandigarh",
  ],
  delhi: ["haryana", "uttar pradesh"],
  "uttar pradesh": [
    "delhi",
    "haryana",
    "uttarakhand",
    "rajasthan",
    "madhya pradesh",
    "bihar",
    "himachal pradesh",
  ],
  punjab: [
    "haryana",
    "himachal pradesh",
    "rajasthan",
    "chandigarh",
    "jammu and kashmir",
  ],
  uttarakhand: ["uttar pradesh", "himachal pradesh"],
  "himachal pradesh": ["punjab", "haryana", "uttarakhand", "jammu and kashmir"],
  "madhya pradesh": [
    "rajasthan",
    "gujarat",
    "maharashtra",
    "uttar pradesh",
    "chhattisgarh",
  ],
  karnataka: [
    "maharashtra",
    "goa",
    "kerala",
    "tamil nadu",
    "andhra pradesh",
    "telangana",
  ],
  "tamil nadu": ["karnataka", "kerala", "andhra pradesh"],
  telangana: ["maharashtra", "karnataka", "andhra pradesh", "chhattisgarh"],
  "andhra pradesh": ["telangana", "karnataka", "tamil nadu", "odisha"],
  "west bengal": ["odisha", "bihar", "jharkhand"],
  bihar: ["uttar pradesh", "jharkhand", "west bengal"],
};
const near = (a = "", b = "") => {
  const x = a.trim().toLowerCase(),
    y = b.trim().toLowerCase();
  return (
    !!x &&
    !!y &&
    (x === y || (NEAR[x] || []).includes(y) || (NEAR[y] || []).includes(x))
  );
};
const days = (a: string, b: string) =>
  Math.abs(Date.parse(a + "T00:00:00") - Date.parse(b + "T00:00:00")) /
  86400000;
export interface Pick {
  m: Member;
  free: boolean;
  trip: string;
  tripAt?: { city: string; date: string };
  busy: string;
  open: number;
}
type PlanBoard = { settings: Settings; clients: BoardClient[] };
type Trip = { c: BoardClient; v: Visit };
// Every dated visit somebody is already going on, except the one being planned.
function tripsOf(board: PlanBoard, skip?: string): Trip[] {
  return board.clients.flatMap((c) =>
    (c.visits || [])
      .filter(
        (v) =>
          v.id !== skip &&
          v.assigneeId &&
          ["assigned", "accepted"].includes(v.status) &&
          v.date,
      )
      .map((v) => ({ c, v })),
  );
}
// Where one person is around that date: busy elsewhere that day, or already on a trip nearby.
function whereabouts(
  m: Member,
  trips: Trip[],
  site: BoardClient,
  date: string,
) {
  const outstation = !isNcr(site.city || "");
  const mine = trips.filter((t) => t.v.assigneeId === m.id);
  const sameDay = date ? mine.filter((t) => t.v.date === date) : [];
  const clash = sameDay.find(
    (t) =>
      t.c.city !== site.city &&
      !(t.c.state && site.state && near(t.c.state, site.state)),
  );
  const trip =
    outstation && date
      ? mine.find(
          (t) =>
            !isNcr(t.c.city || "") &&
            days(t.v.date, date) <= 3 &&
            (t.c.city === site.city || near(t.c.state, site.state)),
        )
      : undefined;
  return {
    m,
    free: !clash,
    busy: clash
      ? "busy in " + (clash.c.city || "another site") + " that day"
      : "",
    trip: trip
      ? m.name +
        " is in " +
        (trip.c.city || trip.c.state) +
        " on " +
        nice(trip.v.date) +
        ": send them to " +
        (site.city || "this site") +
        " on the same trip."
      : "",
    tripAt: trip
      ? { city: trip.c.city || trip.c.state || "", date: trip.v.date }
      : undefined,
    open: mine.length,
  };
}
// Who to send (24 Oct 2026). The main office is in Gurugram, so NCR sites are day trips. For a site outside NCR the
// planner first looks for someone already travelling to the same or a neighbouring state within 3 days of the date.
// Order: skilled enough (good or excellent, and not "NCR only" for an outstation site), free on that date,
// already on a trip nearby, excellent before good, fewest open visits.
export function plan(
  board: PlanBoard,
  site: BoardClient,
  type: string,
  date: string,
  skip?: string,
): Pick[] {
  const rank = { excellent: 2, good: 1 } as Record<string, number>;
  const outstation = !isNcr(site.city || "");
  const trips = tripsOf(board, skip);
  return board.settings.team
    .filter(
      (m) => m.active && rank[m.skills[type]] && (!m.ncrOnly || !outstation),
    )
    .map((m) => whereabouts(m, trips, site, date))
    .sort(
      (a, b) =>
        Number(b.free) - Number(a.free) ||
        Number(!!b.trip) - Number(!!a.trip) ||
        rank[b.m.skills[type]] - rank[a.m.skills[type]] ||
        a.open - b.open,
    );
}

// Flags on a visit (Manish, 24 Oct 2026): is the date hard because nobody is free, or because the site is far and
// nobody is travelling near it? Green when a trip nearby makes it easy. Only open visits with a date get flags.
export interface Flag {
  tone: "red" | "amber" | "green";
  text: string;
}
export function flagsOf(board: PlanBoard, c: BoardClient, v: Visit): Flag[] {
  const out: Flag[] = [];
  if (![...OPEN, "declined"].includes(v.status)) return out;
  if (late(v)) out.push({ tone: "red", text: "Late · date has passed" });
  if (!v.date) return out;
  const trips = tripsOf(board, v.id);
  const assignee =
    v.status !== "declined" && v.assigneeId
      ? board.settings.team.find((m) => m.id === v.assigneeId)
      : undefined;
  const picks = assignee ? [] : plan(board, c, v.type, v.date, v.id);
  const mine = assignee ? whereabouts(assignee, trips, c, v.date) : undefined;
  if (mine && !mine.free)
    out.push({
      tone: "amber",
      text: "Hard date · " + mine.m.name + " " + mine.busy,
    });
  else if (!assignee && !picks.length)
    out.push({
      tone: "amber",
      text:
        "Hard date · nobody skilled" +
        (c.city && !isNcr(c.city) ? " for outside NCR" : ""),
    });
  else if (!assignee && !picks.some((p) => p.free))
    out.push({ tone: "amber", text: "Hard date · nobody free that day" });
  if (c.city && !isNcr(c.city)) {
    const p = mine?.tripAt ? mine : picks.find((x) => x.free && x.tripAt);
    out.push(
      p?.tripAt
        ? {
            tone: "green",
            text:
              (mine ? "On the " : p.m.name + " is on the ") +
              p.tripAt.city +
              " trip · " +
              nice(p.tripAt.date),
          }
        : { tone: "red", text: "Hard date · far, no trip nearby" },
    );
  }
  return out;
}

export function VisitsPage({
  page,
  focus = "",
  focusType,
  focusSite = false,
}: {
  page: "visits" | "assigned" | "approvals" | "team";
  /** A notification opens the matching visit type, or the client's current visit. */
  focus?: string;
  focusType?: VisitType;
  focusSite?: boolean;
}) {
  const [dialog, setDialog] = useState<{
      client: BoardClient;
      visit?: Visit;
    } | null>(null),
    [siteFor, setSiteFor] = useState<BoardClient | null>(null);
  const { board, error, load } = useBoard(!!dialog || !!siteFor);
  const openedFocus = useRef("");
  useEffect(() => {
    if (!focus) {
      openedFocus.current = "";
      return;
    }
    if (!board) return;
    const key = JSON.stringify([focus, focusType, focusSite]);
    if (openedFocus.current === key) return;
    openedFocus.current = key;
    // Back to the plain board address, so a later reload of the board does not open it again.
    location.replace("#crm/visits");
    const c = board.clients.find((x) => x.id === focus);
    if (!c) return;
    setDialog(null);
    setSiteFor(null);
    if (focusSite) {
      setSiteFor(c);
      return;
    }
    const live = (c.visits || [])
      .filter(
        (v) => v.status !== "cancelled" && (!focusType || v.type === focusType),
      )
      .sort(
        (a, b) =>
          Number(["done"].includes(a.status)) -
            Number(["done"].includes(b.status)) ||
          (b.createdAt || "").localeCompare(a.createdAt || ""),
      );
    if (live[0]) setDialog({ client: c, visit: live[0] });
    else if (
      (!focusType || focusType === "first") &&
      c.measurement?.requestedAt &&
      board.role === "admin"
    )
      setDialog({ client: c });
    else setSiteFor(c);
  }, [focus, focusType, focusSite, board]);
  if (error && !board)
    return (
      <section className="card m-status" role="alert">
        <h2>Visits could not be loaded</h2>
        <p>{error}</p>
        <button className="btn dark" onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  if (!board) return <p className="react-empty">Loading visits…</p>;
  const admin = board.role === "admin";
  return (
    <>
      {page === "visits" && (
        <Board
          board={board}
          admin={admin}
          onOpen={(client, visit) => setDialog({ client, visit })}
          onSite={setSiteFor}
        />
      )}
      {page === "assigned" && (
        <Assigned
          board={board}
          onOpen={(client, visit) => setDialog({ client, visit })}
        />
      )}
      {page === "approvals" && (
        <Approvals board={board} admin={admin} reload={load} />
      )}
      {page === "team" && <Team board={board} admin={admin} reload={load} />}
      {dialog && (
        <VisitDialog
          key={dialog.client.id + ":" + (dialog.visit?.id || "request")}
          board={board}
          admin={admin}
          client={dialog.client}
          visit={dialog.visit}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void load();
          }}
        />
      )}
      {siteFor && (
        <SiteDialog
          client={siteFor}
          admin={admin}
          onClose={() => setSiteFor(null)}
          onSaved={() => {
            setSiteFor(null);
            void load();
          }}
        />
      )}
    </>
  );
}

// The head of Measurement's one screen (redesign, 24 Oct 2026; Manish: "all 4 shown clearly with task assigned today",
// flag a hard date). Top: today's visits. Below: one column per visit type. Bottom: where the team is going.
const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
function statusTag(v: Visit) {
  if (v.status === "done")
    return [
      "green",
      "Done" +
        (v.snags?.length
          ? " · " + v.snags.length + " snag" + (v.snags.length > 1 ? "s" : "")
          : ""),
    ];
  if (v.status === "declined") return ["red", "Declined · send someone else"];
  if (v.status === "accepted") return ["blue", "Accepted"];
  if (v.status === "assigned") return ["blue", "Assigned · waiting to accept"];
  return ["grey", "To assign"];
}
function Board({
  board,
  admin,
  onOpen,
  onSite,
}: {
  board: Board;
  admin: boolean;
  onOpen: (c: BoardClient, v?: Visit) => void;
  onSite: (c: BoardClient) => void;
}) {
  const [when, setWhen] = useState("coming"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [place, setPlace] = useState(""),
    [more, setMore] = useState<Record<string, boolean>>({});
  const t = today();
  const rows = useMemo(
    () => board.clients.flatMap((c) => (c.visits || []).map((v) => ({ c, v }))),
    [board.clients],
  );
  const places = [
    ...new Set(
      board.clients
        .flatMap((c) => [c.city, c.state])
        .filter(Boolean) as string[],
    ),
  ].sort();
  const range = rangeOf(when, from, to);
  const inPlace = (c: BoardClient) =>
    !place || c.city === place || c.state === place;
  // "Coming up": every open visit, and what was finished in the last 7 days.
  const keep = (v: Visit) => {
    if (v.status === "cancelled") return false;
    if (when === "coming")
      return (
        v.status !== "done" ||
        (v.doneAt || v.date || "").slice(0, 10) >= addDays(t, -7)
      );
    if (!range) return true;
    return v.date
      ? v.date >= range[0] && v.date <= range[1]
      : v.status !== "done";
  };
  const shown = rows.filter(({ c, v }) => inPlace(c) && keep(v));
  const todays = rows.filter(
    ({ c, v }) => inPlace(c) && v.date === t && v.status !== "cancelled",
  );
  const waiting = board.clients.filter(
    (c) =>
      inPlace(c) &&
      c.measurement?.requestedAt &&
      !(c.visits || []).some(
        (v) => v.type === "first" && !v.revisit && v.status !== "cancelled",
      ),
  );
  const pending = rows.filter(
    ({ v }) =>
      (v.revisit && v.approval?.status === "pending") ||
      v.dateChange?.status === "pending",
  ).length;
  const team = board.settings.team.filter((m) => m.active);
  const d = new Date(t + "T00:00:00");
  return (
    <div className="visits">
      <div className="vtop">
        <h1 className="vtitle">
          Measurement{" "}
          <span className="sub">· {WEEKDAYS[d.getDay()] + " " + nice(t)}</span>
        </h1>
        <select
          aria-label="When"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        >
          <option value="coming">Coming up</option>
          <option value="week">This week</option>
          <option value="next">Next week</option>
          <option value="month">This month</option>
          <option value="all">All dates</option>
          <option value="custom">Custom dates</option>
        </select>
        {when === "custom" && (
          <>
            <input
              type="date"
              aria-label="From"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <input
              type="date"
              aria-label="To"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
        <select
          aria-label="City or state"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
        >
          <option value="">All places</option>
          {places.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {pending > 0 && (
          <a className="vpending" href="#crm/approvals">
            {pending} to approve
          </a>
        )}
      </div>

      <section className="vtoday" aria-label="Today">
        <header>
          <b>Today</b>
          <span className="sub">
            {todays.length
              ? " · " +
                todays.length +
                " visit" +
                (todays.length > 1 ? "s" : "")
              : " · nobody is out today"}
          </span>
        </header>
        {!!todays.length && (
          <div className="vtoday-row">
            {todays.map(({ c, v }) => {
              const nobody = !v.assigneeName || v.status === "declined";
              return (
                <button
                  key={v.id}
                  className={
                    "vtoday-card vline-" +
                    v.type +
                    (nobody ? " vtoday-nobody" : "")
                  }
                  onClick={() => onOpen(c, v)}
                >
                  <b>
                    {nobody ? "Nobody yet" : v.assigneeName} →{" "}
                    {c.city || "site"}
                  </b>
                  <span className="sub">
                    {typeName(v.type)} · {c.name}
                    {v.status === "done" ? " · done" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="vboard">
        {TYPES.map(([type, label]) => {
          const cards = shown
            .filter(({ v }) => v.type === type)
            .map((x) => ({ ...x, flags: flagsOf(board, x.c, x.v) }))
            .sort(
              (a, b) =>
                Number(a.v.status === "done") - Number(b.v.status === "done") ||
                (a.v.date || "9999").localeCompare(b.v.date || "9999"),
            );
          const extra = type === "first" ? waiting : [];
          const open =
            cards.filter(({ v }) => v.status !== "done").length + extra.length;
          // Four cards per column, then Show more (Manish, 24 Oct 2026).
          const nodes = [
            ...extra.map((c) => (
              <button
                key={"req-" + c.id}
                className="vcard vcard-request"
                onClick={() => (admin ? onOpen(c) : onSite(c))}
              >
                <b>{c.name}</b>
                <span className="sub">
                  {[
                    c.city,
                    "asked " +
                      nice((c.measurement?.requestedAt || "").slice(0, 10)),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="vtag grey">
                  Asked by {c.measurement?.by || "Design"}
                  {c.measurement?.date
                    ? " for " + nice(c.measurement.date)
                    : ""}{" "}
                  · plan it
                </span>
              </button>
            )),
            ...cards.map(({ c, v, flags }) => {
              const [tone, text] = statusTag(v);
              return (
                <button
                  key={v.id}
                  className={
                    "vcard" + (v.status === "done" ? " vcard-done" : "")
                  }
                  onClick={() => onOpen(c, v)}
                >
                  <b>{c.name}</b>
                  <span className="sub">
                    {[
                      c.city,
                      v.date === t
                        ? "today"
                        : v.date
                          ? nice(v.date)
                          : givenOf(c, v)
                            ? "asked for " + nice(givenOf(c, v))
                            : "no date yet",
                      v.assigneeName && v.status !== "declined"
                        ? v.assigneeName
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="vtags">
                    <span className={"vtag " + tone}>{text}</span>
                    {v.dateChange?.status === "pending" && (
                      <span className="vtag red">
                        New date {nice(v.dateChange.to)} · needs approval
                      </span>
                    )}
                    {v.revisit && (
                      <span
                        className={
                          "vtag " +
                          (v.approval?.status === "approved" ? "grey" : "red")
                        }
                      >
                        Revisit
                        {v.approval?.status === "pending"
                          ? " · needs approval"
                          : v.approval?.status === "rejected"
                            ? " · rejected"
                            : ""}
                      </span>
                    )}
                  </span>
                  {flags.map((f) => (
                    <span key={f.text} className={"vflag " + f.tone}>
                      {f.text}
                    </span>
                  ))}
                </button>
              );
            }),
          ];
          return (
            <section className={"vcol vcol-" + type} key={type}>
              <header>
                <b>{label}</b>
                <span className="vcount">{open}</span>
              </header>
              <div className="vcards">
                {more[type] ? nodes : nodes.slice(0, 4)}
                {!nodes.length && <p className="vempty">Nothing here.</p>}
                {nodes.length > 4 && (
                  <button
                    type="button"
                    className="vmore"
                    aria-expanded={!!more[type]}
                    aria-label={
                      (more[type] ? "Show fewer " : "Show more ") +
                      label +
                      " visits"
                    }
                    onClick={() => setMore((m) => ({ ...m, [type]: !m[type] }))}
                  >
                    {more[type]
                      ? "Show less"
                      : "Show more (" + (nodes.length - 4) + ")"}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="vtoday vteam" aria-label="Team">
        <header>
          <b>Team</b>
          <span className="sub"> · where everyone is going</span>
        </header>
        {team.length ? (
          <div className="vtoday-row">
            {team.map((m) => {
              const going = rows
                .filter(
                  ({ v }) =>
                    v.assigneeId === m.id &&
                    ["assigned", "accepted"].includes(v.status) &&
                    v.date >= t,
                )
                .sort((a, b) => a.v.date.localeCompare(b.v.date));
              return (
                <div key={m.id} className="vteam-card">
                  <b>
                    {m.name}
                    {m.ncrOnly ? (
                      <span className="sub"> · NCR only</span>
                    ) : null}
                  </b>
                  <span className="sub">
                    {going.length
                      ? going
                          .slice(0, 3)
                          .map(
                            ({ c, v }) =>
                              (v.date === t ? "Today" : nice(v.date)) +
                              " " +
                              (c.city || "site"),
                          )
                          .join(" · ") +
                        (going.length > 3
                          ? " · +" + (going.length - 3) + " more"
                          : "")
                      : "Free · no visits booked"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="sub">
            No team yet. Add people in Team &amp; checklists.
          </p>
        )}
      </section>
    </div>
  );
}

// Assigned (Manish, 24 Oct 2026): who is going, when, to which client, where, for which visit, and who asked and
// assigned it. One row per visit, soonest first.
function Assigned({
  board,
  onOpen,
}: {
  board: Board;
  onOpen: (c: BoardClient, v: Visit) => void;
}) {
  const [who, setWho] = useState(""),
    [when, setWhen] = useState("coming");
  const t = today();
  const rows = board.clients
    .flatMap((c) => (c.visits || []).map((v) => ({ c, v })))
    .filter(
      ({ v }) =>
        v.assigneeId &&
        (!who || v.assigneeId === who || v.assistantId === who) &&
        (when === "all"
          ? v.status !== "cancelled"
          : ["assigned", "accepted"].includes(v.status) &&
            (when === "today"
              ? v.date === t
              : when === "week"
                ? !!v.date && v.date <= addDays(t, 6)
                : true)),
    )
    .sort((a, b) => (a.v.date || "9999").localeCompare(b.v.date || "9999"));
  const askedBy = (v: Visit) =>
    v.askedBy ||
    (v.createdBy === "Design" || v.createdBy === "Sales"
      ? v.createdBy
      : v.createdByName || "Measurement");
  return (
    <div className="visits">
      <div className="vtop">
        <h1 className="vtitle">Assigned</h1>
        <select
          aria-label="When"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        >
          <option value="coming">Coming up</option>
          <option value="today">Today</option>
          <option value="week">Next 7 days</option>
          <option value="all">All, with done</option>
        </select>
        <select
          aria-label="Person"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        >
          <option value="">Everyone</option>
          {board.settings.team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <section className="card">
        {rows.length ? (
          <div className="md-scroll">
            <table className="md-table vassigned">
              <thead>
                <tr>
                  <th>Who goes</th>
                  <th>When</th>
                  <th>Client</th>
                  <th>Where</th>
                  <th>Visit</th>
                  <th>Asked by</th>
                  <th>Assigned by</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, v }) => (
                  <tr key={v.id} onClick={() => onOpen(c, v)}>
                    <td>
                      <b>{v.assigneeName}</b>
                      {v.assistantName && (
                        <span className="sub"> with {v.assistantName}</span>
                      )}
                    </td>
                    <td>
                      {v.date
                        ? v.date === t
                          ? "Today"
                          : WEEKDAYS[new Date(v.date + "T00:00:00").getDay()] +
                            " " +
                            nice(v.date)
                        : "No date yet"}
                      {v.dateChange?.status === "pending" && (
                        <span className="sub">
                          {" "}
                          · new date {nice(v.dateChange.to)} asked
                        </span>
                      )}
                    </td>
                    <td>
                      {c.name}
                      {c.pid && <span className="sub"> · {c.pid}</span>}
                    </td>
                    <td>
                      {[c.city, c.state].filter(Boolean).join(", ") || "-"}
                    </td>
                    <td>
                      <TypeChip type={v.type} />
                    </td>
                    <td>{askedBy(v)}</td>
                    <td>
                      {v.assignedBy
                        ? v.assignedBy +
                          (v.assignedAt
                            ? " · " + nice(v.assignedAt.slice(0, 10))
                            : "")
                        : "-"}
                    </td>
                    <td>
                      <StatusPill v={v} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="react-empty">Nobody is assigned here.</p>
        )}
      </section>
    </div>
  );
}

function money(n: number | null | undefined) {
  return n == null ? "-" : "₹" + Math.round(n).toLocaleString("en-IN");
}

function VisitDialog({
  board,
  admin,
  client: c,
  visit,
  onClose,
  onSaved,
}: {
  board: Board;
  admin: boolean;
  client: BoardClient;
  visit?: Visit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fresh = !visit;
  // The date Sales or the designer gave (24 Oct 2026). Another date needs a reason and a special approval.
  const pendingDate =
    visit?.dateChange?.status === "pending" ? visit.dateChange : undefined;
  const [draft, setDraft] = useState({
    // Measurement only plans what was asked for: a new one here is always the first measurement request.
    type: (visit?.type || "first") as string,
    date:
      pendingDate?.to ||
      visit?.date ||
      (visit ? givenOf(c, visit) : "") ||
      (!visit ? c.measurement?.date || "" : ""),
    dateReason: "",
    assigneeId: visit?.assigneeId || "",
    assistantId: visit?.assistantId || "",
    note: visit?.note || "",
    revisit: visit?.revisit || false,
    reason: visit?.reason || "",
    fault: visit?.fault || "",
    approvalNote: "",
  });
  const [budget, setBudget] = useState({
    visits: c.visitBudget?.visits ?? null,
    rate: c.visitBudget?.rate ?? null,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [editBudget, setEditBudget] = useState(false),
    [asked, setAsked] = useState((c.siteAsk?.at || "").slice(0, 10));
  const set = (k: keyof typeof draft, v: string | boolean) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const given = visit
    ? givenOf(c, visit)
    : draft.type === "first" && !draft.revisit
      ? c.measurement?.date || ""
      : "";
  const askedBy = visit?.askedBy || (given ? c.measurement?.by : "") || "";
  const needsReason =
    !!given &&
    !!draft.date &&
    draft.date !== given &&
    draft.date !== pendingDate?.to;
  const openCount: Record<string, number> = {};
  board.clients.forEach((x) =>
    (x.visits || []).forEach((v) => {
      if (OPEN.includes(v.status) && v.assigneeId)
        openCount[v.assigneeId] = (openCount[v.assigneeId] || 0) + 1;
    }),
  );
  // Who to send: skill, free on the date, already travelling nearby (from the Gurugram office), least busy.
  const picks = draft.type
    ? plan(board, c, draft.type, draft.date, visit?.id)
    : [];
  const best = picks.find((p) => p.free);
  const fits = picks.map((p) => p.m);
  const team = board.settings.team.filter(
    (m) => m.active || m.id === draft.assigneeId || m.id === draft.assistantId,
  );
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "It did not save.");
      setBusy(false);
    }
  }
  // Site details Sales or the designer fill in; Measurement can ask them for what is missing (24 Oct 2026).
  const clientPhone = c.site?.clientPhone || c.phone || "";
  const missing = SITE_ASK.filter(([k]) =>
    k === "siteAddress"
      ? !c.siteAddress
      : k === "clientPhone"
        ? !clientPhone
        : !c.site?.[k],
  );
  const facts: [string, string][] = [
    ["Client", c.name + (c.pid ? " · " + c.pid : "")],
    ["City", [c.city, c.state].filter(Boolean).join(", ")],
    ["Site address", c.siteAddress || ""],
    ["Client number", clientPhone],
    [
      "Site supervisor",
      [c.site?.supervisor, c.site?.supervisorPhone].filter(Boolean).join(" · "),
    ],
    ["Google location", c.site?.location || ""],
    ["Designer", c.design?.designer || ""],
  ];
  return (
    <Dialog
      title={typeName(visit?.type || "first") + " · " + c.name}
      onClose={onClose}
      wide
    >
      {/* Visit window (redesign, 24 Oct 2026): plan on the left, site and budget on the right. */}
      <div className="vdlg-strip">
        {draft.type && <TypeChip type={draft.type} />}
        {visit && <StatusPill v={visit} />}
        {(visit?.revisit || draft.revisit) && (
          <span className="vt vt-revisit">Revisit</span>
        )}
        <span className="sub">
          {[c.pid, [c.city, c.state].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="vdlg">
        <div className="col">
          <Card title={fresh ? "Plan the request" : "Visit plan"}>
            <div className="m-fields">
              <label>
                Visit type
                <select
                  value={draft.type}
                  disabled
                  onChange={(e) => set("type", e.target.value)}
                >
                  <option value="">Choose</option>
                  {TYPES.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Visit date
                <input
                  type="date"
                  value={draft.date}
                  disabled={!admin}
                  onChange={(e) => set("date", e.target.value)}
                />
                {given && (
                  <span className="vgiven">
                    Given date {nice(given)}
                    {askedBy ? " · by " + askedBy : ""}
                    {admin && draft.date !== given && (
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => set("date", given)}
                      >
                        Use it
                      </button>
                    )}
                  </span>
                )}
              </label>
              <label>
                Measurement person
                <select
                  value={draft.assigneeId}
                  disabled={!admin}
                  onChange={(e) => set("assigneeId", e.target.value)}
                >
                  <option value="">Not assigned</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {best?.m.id === m.id
                        ? " ★ suggested"
                        : picks.find((p) => p.m.id === m.id)?.busy
                          ? " · " + picks.find((p) => p.m.id === m.id)!.busy
                          : fits.some((f) => f.id === m.id)
                            ? " · suits this visit"
                            : ""}
                      {" · " + (openCount[m.id] || 0) + " open"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Goes along (to learn)
                <select
                  value={draft.assistantId}
                  disabled={!admin}
                  onChange={(e) => set("assistantId", e.target.value)}
                >
                  <option value="">Nobody</option>
                  {team
                    .filter((m) => m.id !== draft.assigneeId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {draft.type && (
              <div className="vsuggest">
                {best ? (
                  <>
                    <span>
                      <b>Suggested: {best.m.name}</b>
                      {best.trip
                        ? " · " + best.trip
                        : isNcr(c.city || "")
                          ? " · NCR site, a day trip from the Gurugram office"
                          : ""}
                    </span>
                    {admin && draft.assigneeId !== best.m.id && (
                      <button
                        className="btn small dark"
                        onClick={() => set("assigneeId", best.m.id)}
                      >
                        Use
                      </button>
                    )}
                  </>
                ) : (
                  <span>
                    {picks.length
                      ? "Everyone suited is busy elsewhere that day. Pick another date."
                      : "Nobody is graded good or excellent for this visit" +
                        (c.city && !isNcr(c.city) ? " outside NCR" : "") +
                        ". Send someone with an assistant."}
                  </span>
                )}
              </div>
            )}
            {draft.type && draft.date && visit?.status !== "done" && (
              <div className="vtags">
                {flagsOf(board, c, {
                  ...(visit || ({} as Visit)),
                  id: visit?.id || "",
                  type: draft.type as VisitType,
                  date: draft.date,
                  assigneeId: draft.assigneeId,
                  status: draft.assigneeId ? "assigned" : "requested",
                }).map((f) => (
                  <span key={f.text} className={"vflag " + f.tone}>
                    {f.text}
                  </span>
                ))}
              </div>
            )}
            {pendingDate && draft.date === pendingDate.to && (
              <p className="vchange">
                New date {nice(pendingDate.to)} is waiting for special approval
                · {pendingDate.reason}
              </p>
            )}
            {needsReason && (
              <label className="m-wide vchange">
                Moving away from the given date needs a special approval. Why?
                <input
                  value={draft.dateReason}
                  disabled={!admin}
                  onChange={(e) => set("dateReason", e.target.value)}
                />
              </label>
            )}
            <label className="m-wide">
              Note
              <input
                value={draft.note}
                disabled={!admin}
                onChange={(e) => set("note", e.target.value)}
              />
            </label>
            {(draft.revisit || visit?.revisit) && (
              <div className="m-fields">
                <label className="m-wide">
                  Reason for the revisit
                  <input
                    value={draft.reason}
                    disabled={!fresh}
                    onChange={(e) => set("reason", e.target.value)}
                  />
                </label>
                <label>
                  Whose fault
                  <select
                    value={draft.fault}
                    disabled={!fresh}
                    onChange={(e) => set("fault", e.target.value)}
                  >
                    <option value="">Not decided</option>
                    <option value="client">
                      Client (changed the site; may be charged)
                    </option>
                    <option value="magppie">
                      Magppie (we go again at our cost)
                    </option>
                  </select>
                </label>
                {visit?.approval && (
                  <p>
                    Founder&rsquo;s Office: <b>{visit.approval.status}</b>
                    {visit.approval.note ? " · " + visit.approval.note : ""}
                  </p>
                )}
              </div>
            )}
            {error && (
              <p className="msg" role="alert">
                {error}
              </p>
            )}
            {admin && (
              <div className="flexrow">
                <button
                  className="btn dark"
                  disabled={
                    busy ||
                    !draft.type ||
                    (draft.revisit && !draft.reason.trim()) ||
                    (needsReason && !draft.dateReason.trim())
                  }
                  onClick={() =>
                    run(() =>
                      fresh
                        ? api(
                            "/api/measurement/visits/" +
                              encodeURIComponent(c.id),
                            {
                              type: draft.type,
                              date: draft.date,
                              dateReason: draft.dateReason,
                              assigneeId: draft.assigneeId,
                              assistantId: draft.assistantId,
                              note: draft.note,
                              revisit: draft.revisit,
                              reason: draft.reason,
                              fault: draft.fault,
                            },
                          )
                        : api(
                            "/api/measurement/visits/" +
                              encodeURIComponent(c.id) +
                              "/" +
                              visit!.id,
                            {
                              date: draft.date,
                              dateReason: draft.dateReason,
                              assigneeId: draft.assigneeId,
                              assistantId: draft.assistantId,
                              note: draft.note,
                            },
                          ),
                    )
                  }
                >
                  {(fresh ? "Save plan" : "Save") +
                    (needsReason ? " · new date goes for approval" : "")}
                </button>
                {!fresh && !["done", "cancelled"].includes(visit!.status) && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("Cancel this visit?"))
                        void run(() =>
                          api(
                            "/api/measurement/visits/" +
                              encodeURIComponent(c.id) +
                              "/" +
                              visit!.id,
                            { cancel: true },
                          ),
                        );
                    }}
                  >
                    Cancel visit
                  </button>
                )}
              </div>
            )}
          </Card>
          {visit && <Result visit={visit} board={board} clientId={c.id} />}
        </div>
        <div className="col">
          <Card title="Site">
            <div className="vsite-actions">
              {c.docs?.drawing && (
                <a
                  className="btn small"
                  href={
                    "/data/uploads/" +
                    encodeURIComponent(c.id) +
                    "/" +
                    encodeURIComponent(c.docs.drawing)
                  }
                  target="_blank"
                  rel="noopener"
                >
                  Open drawing
                </a>
              )}
              {c.site?.location && (
                <a
                  className="btn small"
                  href={c.site.location}
                  target="_blank"
                  rel="noopener"
                >
                  Google location
                </a>
              )}
              {c.site?.supervisorPhone && (
                <a className="btn small" href={"tel:" + c.site.supervisorPhone}>
                  Call supervisor
                </a>
              )}
              {clientPhone && (
                <a className="btn small" href={"tel:" + clientPhone}>
                  Call client
                </a>
              )}
            </div>
            <dl className="vfacts">
              {facts.slice(2).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v || "Not given"}</dd>
                </div>
              ))}
            </dl>
            {missing.length > 0 && (
              <div className="vask">
                <span>
                  Missing: {missing.map(([, word]) => word).join(", ")}
                  {asked
                    ? " · asked Sales and the designer " + nice(asked)
                    : ""}
                </span>
                {admin && (
                  <button
                    className="btn small"
                    onClick={() =>
                      api<{ at: string }>(
                        "/api/measurement/ask/" + encodeURIComponent(c.id),
                        { missing: missing.map(([k]) => k) },
                      )
                        .then((r) => setAsked(r.at.slice(0, 10)))
                        .catch((e: Error) => setError(e.message))
                    }
                  >
                    {asked ? "Ask again" : "Ask Sales and the designer"}
                  </button>
                )}
              </div>
            )}
          </Card>
          <Card title="Visit budget">
            <div className="vbudget">
              <b>
                {c.budget.used} of {c.budget.visits ?? "?"} visits used
              </b>
              <span className="sub">
                {c.budget.rate != null
                  ? money(c.budget.rate) + " per visit"
                  : "Rate not set"}
                {c.budget.over
                  ? " · " +
                    c.budget.over +
                    " over (" +
                    money(c.budget.overAmount) +
                    ")"
                  : ""}
              </span>
              {admin && (
                <button
                  className="btn small"
                  onClick={() => setEditBudget(!editBudget)}
                >
                  {editBudget ? "Close" : "Edit"}
                </button>
              )}
            </div>
            {admin && editBudget && (
              <div className="m-fields">
                <label>
                  Visits included
                  <input
                    type="number"
                    min={0}
                    value={budget.visits ?? ""}
                    onChange={(e) =>
                      setBudget((b) => ({
                        ...b,
                        visits:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Rate per visit (₹)
                  <input
                    type="number"
                    min={0}
                    value={budget.rate ?? ""}
                    onChange={(e) =>
                      setBudget((b) => ({
                        ...b,
                        rate:
                          e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api(
                        "/api/measurement/budget/" + encodeURIComponent(c.id),
                        budget,
                        "PUT",
                      ),
                    )
                  }
                >
                  Save budget
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Dialog>
  );
}

// What came back from the site: accepted, checklist answers, snags, photos, PDI fields.
function Result({
  visit: v,
  board,
  clientId,
}: {
  visit: Visit;
  board: Board;
  clientId: string;
}) {
  const list =
    board.settings.checklists[v.type as keyof Settings["checklists"]] || [];
  const file = (name: string) =>
    "/data/uploads/" +
    encodeURIComponent(clientId) +
    "/" +
    encodeURIComponent(name);
  return (
    <Card title="From the site">
      <p className="sub">
        {v.acceptedAt
          ? "Accepted " + v.acceptedAt.slice(0, 10)
          : "Not accepted yet"}
        {v.doneAt ? " · done " + v.doneAt.slice(0, 10) : ""}
        {v.declineReason ? " · declined: " + v.declineReason : ""}
      </p>
      {list.map((i) => {
        const r = v.checklist?.[i.id];
        return (
          <div key={i.id} className="line rule">
            <span>{i.text}</span>
            <span
              className={
                "pill " +
                (r?.state === "ok"
                  ? "green"
                  : r?.state === "wrong"
                    ? "red"
                    : r?.state === "notReady"
                      ? "yellow"
                      : "grey")
              }
            >
              {r?.state === "ok"
                ? "OK"
                : r?.state === "wrong"
                  ? "Wrong"
                  : r?.state === "notReady"
                    ? "Site not ready"
                    : "Not checked"}
            </span>
          </div>
        );
      })}
      {v.type === "pdi" &&
        board.settings.pdiFields.map((f) => (
          <div key={f.id} className="line rule">
            <span>{f.text}</span>
            <b>{v.fields?.[f.id] || "-"}</b>
          </div>
        ))}
      {!!v.snags?.length && (
        <>
          <b>Snag list</b>
          <ul>
            {v.snags.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ul>
        </>
      )}
      {!!v.photos?.length && (
        <p>
          {v.photos.map((p) => (
            <a
              key={p.name}
              href={file(p.name)}
              target="_blank"
              rel="noopener"
              className="vt-photo"
            >
              Photo {p.at.slice(0, 10)}
            </a>
          ))}
        </p>
      )}
      {v.visitNote && <p>{v.visitNote}</p>}
    </Card>
  );
}

function SiteDialog({
  client: c,
  admin,
  onClose,
  onSaved,
}: {
  client: BoardClient;
  admin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState({
    siteAddress: c.siteAddress || "",
    location: c.site?.location || "",
    supervisor: c.site?.supervisor || "",
    supervisorPhone: c.site?.supervisorPhone || "",
  });
  const [error, setError] = useState("");
  return (
    <Dialog title={"Site details · " + c.name} onClose={onClose}>
      <div className="m-fields">
        {(
          [
            ["siteAddress", "Site address"],
            ["location", "Google location link"],
            ["supervisor", "Site supervisor"],
            ["supervisorPhone", "Site supervisor phone"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="m-wide">
            {label}
            <input
              value={d[k]}
              disabled={!admin}
              onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {error && <p className="msg">{error}</p>}
      {admin && (
        <button
          className="btn dark"
          onClick={() =>
            api("/api/measurement/site/" + encodeURIComponent(c.id), d, "PUT")
              .then(onSaved)
              .catch((e: Error) => setError(e.message))
          }
        >
          Save
        </button>
      )}
    </Dialog>
  );
}

// Special approvals (24 Oct 2026): a new date instead of the one Sales or the designer gave, and revisits. An admin
// login decides (it stands in for the Founder's Office until there is a role for it).
function Approvals({
  board,
  admin,
  reload,
}: {
  board: Board;
  admin: boolean;
  reload: () => Promise<void>;
}) {
  const rows = board.clients.flatMap((c) =>
    (c.visits || [])
      .filter((v) => v.revisit || v.dateChange)
      .map((v) => ({ c, v })),
  );
  const dates = rows.filter(({ v }) => v.dateChange?.status === "pending");
  const revisits = rows.filter(
    ({ v }) => v.revisit && v.approval?.status === "pending",
  );
  const [notes, setNotes] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const decide = (c: BoardClient, v: Visit, key: string, decision: string) =>
    api("/api/measurement/visits/" + encodeURIComponent(c.id) + "/" + v.id, {
      [key]: decision,
      approvalNote: notes[v.id] || "",
    })
      .then(reload)
      .catch((e: Error) => setError(e.message));
  const buttons = (c: BoardClient, v: Visit, key: string) =>
    admin && (
      <div className="flexrow">
        <input
          aria-label="Note"
          placeholder="Note"
          value={notes[v.id] || ""}
          onChange={(e) => setNotes((n) => ({ ...n, [v.id]: e.target.value }))}
        />
        <button
          className="btn dark"
          onClick={() => void decide(c, v, key, "approved")}
        >
          Approve
        </button>
        <button
          className="btn warn"
          onClick={() => void decide(c, v, key, "rejected")}
        >
          Reject
        </button>
      </div>
    );
  const decided = rows.filter(
    ({ v }) =>
      (v.dateChange && v.dateChange.status !== "pending") ||
      (v.revisit && v.approval?.status !== "pending"),
  );
  return (
    <div className="twolists">
      <Card
        title="Waiting for approval"
        tag={<span className="sub">{dates.length + revisits.length}</span>}
      >
        {error && <p className="msg">{error}</p>}
        {dates.map(({ c, v }) => (
          <div key={"d" + v.id} className="approval">
            <div>
              <strong>{c.name}</strong> <TypeChip type={v.type} />{" "}
              <span className="vtag red">New date</span>
              <p className="sub">
                Given {nice(v.dateChange!.from)}
                {v.askedBy ? " by " + v.askedBy : ""} · asked to move to{" "}
                <b>{nice(v.dateChange!.to)}</b> · {v.dateChange!.reason}
                {v.dateChange!.by ? " · " + v.dateChange!.by : ""}
              </p>
            </div>
            {buttons(c, v, "dateApproval")}
          </div>
        ))}
        {revisits.map(({ c, v }) => (
          <div key={"r" + v.id} className="approval">
            <div>
              <strong>{c.name}</strong> <TypeChip type={v.type} />{" "}
              <span className="vtag red">Revisit</span>
              <p className="sub">
                {v.reason} · fault:{" "}
                {v.fault === "client"
                  ? "client"
                  : v.fault === "magppie"
                    ? "Magppie"
                    : "not decided"}{" "}
                · budget used {c.budget.used} of {c.budget.visits ?? "?"}
                {c.budget.over
                  ? " · over by " + money(c.budget.overAmount)
                  : ""}
              </p>
            </div>
            {buttons(c, v, "approval")}
          </div>
        ))}
        {!dates.length && !revisits.length && (
          <p className="react-empty">Nothing waiting.</p>
        )}
      </Card>
      <Card title="Decided" tag={<span className="sub">{decided.length}</span>}>
        <div className="rows">
          {decided.map(({ c, v }) => {
            const status =
              v.dateChange && v.dateChange.status !== "pending"
                ? v.dateChange.status
                : v.approval?.status || "";
            return (
              <div key={v.id} className="row react-row">
                <span>
                  <strong>{c.name}</strong> <TypeChip type={v.type} />
                  <span className="sub">
                    {v.dateChange && v.dateChange.status !== "pending"
                      ? " New date " + nice(v.dateChange.to)
                      : " Revisit · " + v.reason}
                  </span>
                </span>
                <span
                  className={
                    "pill " + (status === "approved" ? "green" : "red")
                  }
                >
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// Team & checklists is master data (Manish, 24 Oct 2026): clean read-only tables, and an Edit button that opens the
// same lists for changes, with Save and Cancel.
const GRADE_TONE: Record<string, string> = {
  excellent: "green",
  good: "blue",
  poor: "red",
};
function Team({
  board,
  admin,
  reload,
}: {
  board: Board;
  admin: boolean;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <TeamEdit
        board={board}
        admin={admin}
        reload={reload}
        onDone={() => setEditing(false)}
      />
    );
  const s = board.settings;
  const list = (title: string, rows: Item[], photo: boolean) => (
    <Card title={title} tag={<span className="sub">{rows.length}</span>}>
      {rows.length ? (
        <table className="md-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Point</th>
              {photo && <th>Photo needed</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((it, i) => (
              <tr key={it.id || i}>
                <td>{i + 1}</td>
                <td>{it.text}</td>
                {photo && <td>{it.photo ? "Yes" : "-"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="react-empty">Empty.</p>
      )}
    </Card>
  );
  return (
    <div className="visits-team">
      <div className="page-h md-head">
        <div>
          <h1>Team &amp; checklists</h1>
          <p className="sub">
            Master data for Measurement: who goes on visits, what they are good
            at, and what is checked on site.
          </p>
        </div>
        {admin && (
          <button className="btn dark" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      <Card
        title="Measurement team"
        tag={
          <span className="sub">
            {s.team.filter((m) => m.active).length} active
          </span>
        }
      >
        {s.team.length ? (
          <div className="md-scroll">
            <table className="md-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Login email</th>
                  <th>Phone</th>
                  {TYPES.map(([id, label]) => (
                    <th key={id}>{label}</th>
                  ))}
                  <th>NCR only</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {s.team.map((m) => (
                  <tr key={m.id} className={m.active ? "" : "md-off"}>
                    <td>
                      <b>{m.name}</b>
                    </td>
                    <td>{m.email || "-"}</td>
                    <td>{m.phone || "-"}</td>
                    {TYPES.map(([id]) => (
                      <td key={id}>
                        {m.skills[id] ? (
                          <span className={"pill " + GRADE_TONE[m.skills[id]]}>
                            {m.skills[id][0].toUpperCase() +
                              m.skills[id].slice(1)}
                          </span>
                        ) : (
                          <span className="sub">Not graded</span>
                        )}
                      </td>
                    ))}
                    <td>{m.ncrOnly ? "Yes" : "-"}</td>
                    <td>{m.active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="react-empty">No team yet. Use Edit to add people.</p>
        )}
      </Card>
      <div className="twolists">
        {list("EPT marking checklist", s.checklists.eptMarking, true)}
        {list("EPT verification checklist", s.checklists.eptVerification, true)}
        {list("PDI checklist", s.checklists.pdi, true)}
        {list("PDI fields", s.pdiFields, false)}
      </div>
    </div>
  );
}
function TeamEdit({
  board,
  admin,
  reload,
  onDone,
}: {
  board: Board;
  admin: boolean;
  reload: () => Promise<void>;
  onDone: () => void;
}) {
  const [d, setD] = useState<Settings>(() =>
      JSON.parse(JSON.stringify(board.settings)),
    ),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const blank = (): Member => ({
    id: "",
    name: "",
    email: "",
    phone: "",
    skills: { first: "", eptMarking: "", eptVerification: "", pdi: "" },
    ncrOnly: false,
    active: true,
  });
  const setMember = (i: number, change: Partial<Member>) =>
    setD((x) => ({
      ...x,
      team: x.team.map((m, j) => (j === i ? { ...m, ...change } : m)),
    }));
  const items = (
    key: "eptMarking" | "eptVerification" | "pdi" | "pdiFields",
    title: string,
    photo: boolean,
  ) => {
    const list = key === "pdiFields" ? d.pdiFields : d.checklists[key];
    const put = (next: Item[]) =>
      setD((x) =>
        key === "pdiFields"
          ? { ...x, pdiFields: next }
          : { ...x, checklists: { ...x.checklists, [key]: next } },
      );
    return (
      <Card title={title} tag={<span className="sub">{list.length}</span>}>
        {list.map((it, i) => (
          <div key={i} className="flexrow vt-item">
            <input
              aria-label={title + " " + (i + 1)}
              value={it.text}
              disabled={!admin}
              onChange={(e) =>
                put(
                  list.map((x, j) =>
                    j === i ? { ...x, text: e.target.value } : x,
                  ),
                )
              }
            />
            {photo && (
              <label className="m-check">
                <input
                  type="checkbox"
                  checked={!!it.photo}
                  disabled={!admin}
                  onChange={(e) =>
                    put(
                      list.map((x, j) =>
                        j === i ? { ...x, photo: e.target.checked } : x,
                      ),
                    )
                  }
                />
                Photo
              </label>
            )}
            {admin && (
              <button
                className="btn small"
                onClick={() => put(list.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {!list.length && (
          <p className="react-empty">Empty. Add the points from your list.</p>
        )}
        {admin && (
          <button
            className="btn small"
            onClick={() => put([...list, { id: "", text: "", photo: false }])}
          >
            + Add
          </button>
        )}
      </Card>
    );
  };
  return (
    <div className="visits-team">
      <Card
        title="Measurement team"
        tag={
          <span className="sub">
            {d.team.filter((m) => m.active).length} active
          </span>
        }
      >
        <p className="sub">
          Grade each person for the four visits. Poor or not graded: never sent
          alone, only with someone. A login with the same email opens their own
          page at /my-visits.
        </p>
        <div className="vt-table">
          <div className="vt-head">
            <span>Name</span>
            <span>Login email</span>
            <span>Phone</span>
            {TYPES.map(([, label]) => (
              <span key={label}>{label}</span>
            ))}
            <span>NCR only</span>
            <span>Active</span>
          </div>
          {d.team.map((m, i) => (
            <div key={i} className="vt-rowedit">
              <input
                aria-label="Name"
                value={m.name}
                disabled={!admin}
                onChange={(e) => setMember(i, { name: e.target.value })}
              />
              <input
                aria-label="Login email"
                type="email"
                value={m.email}
                disabled={!admin}
                onChange={(e) => setMember(i, { email: e.target.value })}
              />
              <input
                aria-label="Phone"
                value={m.phone}
                disabled={!admin}
                onChange={(e) => setMember(i, { phone: e.target.value })}
              />
              {TYPES.map(([id, label]) => (
                <select
                  key={id}
                  aria-label={label}
                  value={m.skills[id] || ""}
                  disabled={!admin}
                  onChange={(e) =>
                    setMember(i, {
                      skills: { ...m.skills, [id]: e.target.value },
                    })
                  }
                >
                  {GRADES.map(([g, t]) => (
                    <option key={g} value={g}>
                      {t}
                    </option>
                  ))}
                </select>
              ))}
              <input
                type="checkbox"
                aria-label="NCR only"
                checked={m.ncrOnly}
                disabled={!admin}
                onChange={(e) => setMember(i, { ncrOnly: e.target.checked })}
              />
              <input
                type="checkbox"
                aria-label="Active"
                checked={m.active}
                disabled={!admin}
                onChange={(e) => setMember(i, { active: e.target.checked })}
              />
            </div>
          ))}
        </div>
        {!d.team.length && <p className="react-empty">No team yet.</p>}
        {admin && (
          <button
            className="btn small"
            onClick={() => setD((x) => ({ ...x, team: [...x.team, blank()] }))}
          >
            + Add person
          </button>
        )}
      </Card>
      <div className="twolists">
        {items("eptMarking", "EPT marking checklist", true)}
        {items("eptVerification", "EPT verification checklist", true)}
        {items("pdi", "PDI checklist", true)}
        {items("pdiFields", "PDI fields", false)}
      </div>
      {admin && (
        <div className="flexrow">
          <button
            className="btn dark"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              try {
                const saved = await api<Settings>(
                  "/api/measurement/settings",
                  d,
                  "PUT",
                );
                setD(saved);
                await reload();
                onDone();
                return;
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "It did not save.");
              }
              setBusy(false);
            }}
          >
            Save team and checklists
          </button>
          <button className="btn" disabled={busy} onClick={onDone}>
            Cancel
          </button>
          {msg && <span className="sub">{msg}</span>}
        </div>
      )}
    </div>
  );
}

// Opens one visit (from the Requests pages) in the same editable form as the board.
export function EditVisit({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [clientId, visitId] = id.split("|");
  const { board, error, load } = useBoard(true);
  if (error)
    return (
      <Dialog title="Visit" onClose={onClose}>
        <p className="msg">{error}</p>
      </Dialog>
    );
  if (!board) return null;
  const c = board.clients.find((x) => x.id === clientId);
  const v = c?.visits?.find((x) => x.id === visitId);
  if (!c || !v)
    return (
      <Dialog title="Visit" onClose={onClose}>
        <p>This visit no longer exists.</p>
      </Dialog>
    );
  return (
    <VisitDialog
      board={board}
      admin={board.role === "admin"}
      client={c}
      visit={v}
      onClose={onClose}
      onSaved={() => {
        void load();
        onClose();
      }}
    />
  );
}
