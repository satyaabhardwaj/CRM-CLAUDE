import type { DesignClient as Client } from "./model";
import type { WindowKind } from "./types";
import { rules } from "./model";
export const STEP: Record<string, string> = {
  drf: "DRF not sent yet",
  withDesign: "With Design",
  toShare: "Sales to share with client",
  withClient: "With client",
};
export const isRevision = (c: Client) =>
  c.design.proposals.length > 0 && !!c.design.revisions.at(-1);
export const cameAt = (c: Client) =>
  rules().handed(c)
    ? c.movedAt || c.bookedAt || c.receivedAt
    : c.design.stepAt || c.receivedAt;
export const owed = (c: Client) =>
  rules()
    .ledger(c)
    .reduce((n, r) => n + (r.name === "Booking" ? 0 : r.due), 0);
export const short = (d?: string) =>
  d ? window.Kit.day(d).replace(/ \d{4}$/, "") : "";
export const salesLine = (c: Client) =>
  window.People.owner(c) +
  " · " +
  (rules().lastSpoke(c)
    ? "spoke " + short(rules().lastSpoke(c)!)
    : "not spoken yet") +
  (c.nextFollowUp ? " · next follow-up " + short(c.nextFollowUp) : "");
export const pdiWaiting = (all: Client[]) =>
  all
    .filter(rules().handed)
    .filter(
      (c) =>
        !c.factoryAt &&
        rules().readyForPdi(c) &&
        !rules().flow(c).pdi.approvedAt,
    );
export const pdiSince = (c: Client) => {
  const f = rules().flow(c);
  return (
    [f.design.approvedAt, f.appliances.signedAt, f.ept.signedAt]
      .filter(Boolean)
      .sort()
      .at(-1) || ""
  );
};
export const factoryWaiting = (all: Client[]) =>
  all
    .filter(rules().handed)
    .filter((c) => !c.factoryAt && rules().flow(c).pdi.approvedAt);
export const factoryGone = (all: Client[]) => all.filter((c) => !!c.factoryAt);
export const mailLine = (c: Client) =>
  !c.factoryMail
    ? "factory email: not sent"
    : c.factoryMail.state === "sent"
      ? "factory emailed" + (c.factoryMail.test ? " (test mode)" : "")
      : c.factoryMail.state === "queued"
        ? "factory email not sent: automatic sending is disabled"
        : c.factoryMail.state === "sending"
          ? "emailing the factory…"
          : "factory email not sent: " + (c.factoryMail.why || "");
export interface Task {
  c: Client;
  pre: boolean;
  kind: WindowKind;
  at?: string;
  due: string;
  what: string;
}
export function tasks(all: Client[]): Task[] {
  const L = rules(),
    out: Task[] = [];
  all.forEach((c) => {
    if (c.stage === "design" && c.design.step === "withDesign")
      out.push({
        c,
        pre: true,
        kind: "proposal",
        at: c.design.stepAt || c.design.sentAt,
        due: c.design.promisedBy || "",
        what: isRevision(c)
          ? "Revision · V" +
            (c.design.proposals.length + 1) +
            " · " +
            c.design.revisions.at(-1)!.reason
          : "First proposal",
      });
    else if (L.handed(c) && !c.factoryAt && L.postStage(c) !== "Factory") {
      const st = L.postStage(c),
        kind: Record<string, WindowKind> = {
          "Site measurement": "measure",
          EPT: "ept",
          Appliances: "appliances",
          Design: "designflow",
          PDI: "pdi",
        },
        d = L.dates(c);
      out.push({
        c,
        pre: false,
        kind: kind[st] || "client",
        at: c.movedAt || c.bookedAt,
        due: d ? (st === "PDI" ? d.pdi : d.signoff) : "",
        what:
          st +
          " · " +
          (
            {
              "Site measurement":
                "first site measurement · " +
                L.measureState(c).step.toLowerCase(),
              EPT: L.flowState(c).ept.step,
              Appliances: "appliance list to finish",
              Design: "design to finalise",
              PDI: "last PDI to approve",
              "Accounts go-ahead": window.Kit.money(L.productionRow(c).due),
            } as Record<string, string>
          )[st],
      });
    }
  });
  return out.sort(
    (a, b) =>
      Date.parse(a.at || "1970-01-01") - Date.parse(b.at || "1970-01-01"),
  );
}
export function seen(
  all: Client[],
  designer: string,
  find: string,
  range: string,
  now = new Date(),
) {
  const today = window.Kit.ymd(now),
    start = new Date(now);
  if (range === "week") start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  if (range === "month") start.setDate(1);
  const from = window.Kit.ymd(start),
    q = find.trim().toLowerCase();
  return all.filter((c) => {
    const at = window.Kit.ymd(new Date(cameAt(c)));
    return (
      (!designer || c.design.designer === designer) &&
      (range === "all" || (at >= from && at <= today)) &&
      (!q ||
        `${c.name} ${c.pid} ${c.city} ${c.phone || ""}`
          .toLowerCase()
          .includes(q))
    );
  });
}
export function pages(tab: string, all: Client[]) {
  const L = rules(),
    mine = all.filter(L.handed),
    step = (s: string) =>
      all.filter((c) => c.stage === "design" && (c.design.step || "drf") === s),
    book = all.filter(
      (c) => ["token", "booked"].includes(c.stage) && !L.handed(c),
    );
  return tab === "today"
    ? []
    : tab === "post"
      ? [
          {
            id: "board",
            title: "Post-design board",
            short: "Board",
            count: mine.filter((c) => !c.factoryAt).length,
            summary: ["Site measurement", "Design", "Appliances", "EPT"]
              .map(
                (s) =>
                  mine.filter((c) => L.postStage(c) === s).length +
                  " at " +
                  s.toLowerCase(),
              )
              .join(" · "),
          },
          {
            id: "pdi",
            title: "PDI approval",
            short: "PDI",
            count: pdiWaiting(all).length,
            summary:
              "Design, appliances and EPT done, waiting for the last PDI",
          },
          {
            id: "collections",
            title: "Collections",
            short: "Collect",
            count: mine.filter((c) => owed(c) > 0).length,
            summary:
              window.Kit.short(mine.reduce((n, c) => n + owed(c), 0)) +
              " still to collect after booking",
          },
          {
            id: "factory",
            title: "Shoot to factory",
            short: "Factory",
            count: factoryWaiting(all).length + factoryGone(all).length,
            summary:
              factoryWaiting(all).length +
              " waiting for 80% or Accounts · " +
              factoryGone(all).length +
              " in the factory",
          },
          {
            id: "tracker",
            title: "Order tracker",
            short: "Tracker",
            count: mine.length,
            summary: ["Factory", "Dispatch", "Handed over"]
              .map(
                (s) =>
                  mine.filter((c) => L.postStage(c) === s).length +
                  " " +
                  s.toLowerCase(),
              )
              .join(" · "),
          },
        ]
      : [
          {
            id: "make",
            title: "Proposals to make",
            short: "To make",
            count: step("withDesign").length,
            summary:
              step("withDesign").filter(isRevision).length +
              " revision(s) · " +
              step("withDesign").filter(
                (c) =>
                  c.design.promisedBy &&
                  c.design.promisedBy < window.Kit.today(),
              ).length +
              " late",
          },
          {
            id: "timelines",
            title: "Timelines",
            short: "Timelines",
            count: book.filter(
              (c) => c.stage === "booked" && c.timeline.handover,
            ).length,
            summary: "Overwrite a date if it cannot be met",
          },
          {
            id: "sales",
            title: "With Sales",
            short: "Sales",
            count: step("drf").length + step("toShare").length,
            summary:
              step("drf").length +
              " DRF not sent · " +
              step("toShare").length +
              " to share with client",
          },
          {
            id: "booking",
            title: "Approved · booking amount coming in",
            short: "Booking",
            count: book.length,
            summary: "Moves to post-design when the booking share is in",
          },
          {
            id: "all",
            title: "All pre-design clients",
            short: "All",
            count: all.filter((c) => c.stage === "design").length + book.length,
            summary: "With the sales follow-up on each",
          },
        ];
}
