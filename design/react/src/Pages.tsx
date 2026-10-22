import { useRef, useState, type ReactNode } from "react";
import { useCardLabels } from "../../../backend/react/src/Shell";
import type { Context, WindowKind } from "./types";
import type { DesignClient as Client } from "./model";
import { rules } from "./model";
import { Pill, Select, day } from "./ui";
import { FlowSteps } from "./ClientForm";
import {
  tasks,
  isRevision,
  short,
  salesLine,
  owed,
  STEP,
  pdiWaiting,
  pdiSince,
  factoryWaiting,
  factoryGone,
  mailLine,
} from "./selectors";
interface Row {
  c: Client;
  sub: ReactNode;
  pill?: ReactNode;
  kind?: WindowKind;
  given?: string;
  due?: string;
}
export function List({
  title,
  rows,
  empty,
  tools,
  ctx,
  task = false,
}: {
  title: string;
  rows: Row[];
  empty: string;
  tools?: ReactNode;
  ctx: Context;
  task?: boolean;
}) {
  return (
    <section className="card list">
      <div className="list-h">
        <h1>
          {title}
          <span className="count">{rows.length}</span>
        </h1>
        {tools}
      </div>
      {task && (
        <div className="board-row head design-task-grid">
          <b>Given</b>
          <b>Client</b>
          <b>Due</b>
        </div>
      )}
      <div className="rows">
        {rows.length ? (
          rows.map((r, i) => (
            <button
              type="button"
              key={r.c.id + "-" + i}
              className={
                task ? "board-row design-task-grid" : "item design-list-row"
              }
              onClick={() => ctx.show(r.kind || "client", r.c.id)}
            >
              {task && <span>{short(r.given) || "-"}</span>}
              <span className="who">
                <b>{r.c.name}</b>
                <small>{r.sub}</small>
              </span>
              {task ? (
                <span
                  className={
                    r.due && r.due < window.Kit.today() ? "due" : "notdue"
                  }
                >
                  {short(r.due) || "No date"}
                </span>
              ) : (
                r.pill
              )}
            </button>
          ))
        ) : (
          <div className="empty">{empty}</div>
        )}
      </div>
    </section>
  );
}
export function PdiList({
  all,
  ctx,
  task = false,
}: {
  all: Client[];
  ctx: Context;
  task?: boolean;
}) {
  return (
    <List
      title="PDI approval"
      ctx={ctx}
      task={task}
      empty="Nothing waiting for PDI."
      rows={pdiWaiting(all)
        .sort((a, b) => pdiSince(a).localeCompare(pdiSince(b)))
        .map((c) => ({
          c,
          kind: "pdi",
          given: pdiSince(c),
          due: rules().dates(c)?.pdi,
          sub:
            (c.design.designer || "No designer") +
            " · " +
            (c.sm || window.People.owner(c)),
          pill: (
            <Pill tone="yellow">
              {
                rules()
                  .flow(c)
                  .pdi.log.filter((x) => x.what === "PDI visit done").length
              }{" "}
              PDI visit(s)
            </Pill>
          ),
        }))}
    />
  );
}
export function Today({ ctx, all }: { ctx: Context; all: Client[] }) {
  const [kind, setKind] = useState(""),
    [postKind, setPostKind] = useState(""),
    list = tasks(all),
    postNames: Record<string, string> = {
      measure: "Site measurement",
      design: "Design",
      appliances: "Appliances",
      ept: "EPT",
      pdi: "PDI",
      collect: "Accounts go-ahead",
    },
    row = (t: (typeof list)[number]): Row => ({
      c: t.c,
      kind: t.kind,
      given: t.at,
      due: t.due,
      sub: [
        t.pre ? t.what : t.what.replace(/ · .*$/, ""),
        t.c.design.designer || "No designer",
      ].join(" · "),
    });
  return (
    <div className="twolists design-three">
      <List
        title="Pre-design tasks"
        ctx={ctx}
        task
        tools={
          <Select
            label="Pre-design type of task"
            value={kind}
            options={[
              ["first", "First proposal"],
              ["revision", "Revision"],
              ["late", "Waiting 3 days or more"],
            ]}
            onChange={setKind}
          />
        }
        rows={list
          .filter(
            (t) =>
              t.pre &&
              (!kind ||
                (kind === "late"
                  ? window.Kit.daysSince(t.at) >= 3
                  : (kind === "revision") === isRevision(t.c))),
          )
          .map(row)}
        empty="No proposals or revisions to make."
      />
      <List
        title="Post-design tasks"
        ctx={ctx}
        task
        tools={
          <Select
            label="Post-design type of task"
            value={postKind}
            options={[
              ...Object.entries(postNames),
              ["late", "Waiting 3 days or more"],
            ]}
            onChange={setPostKind}
          />
        }
        rows={list
          .filter(
            (t) =>
              !t.pre &&
              (!postKind ||
                (postKind === "late"
                  ? window.Kit.daysSince(t.at) >= 3
                  : rules().postStage(t.c) === postNames[postKind])),
          )
          .map(row)}
        empty="No post-design work waiting."
      />
      <PdiList all={all} ctx={ctx} task />
    </div>
  );
}
export function Pre({ ctx, all }: { ctx: Context; all: Client[] }) {
  const L = rules(),
    book = all.filter(
      (c) => ["token", "booked"].includes(c.stage) && !L.handed(c),
    );
  let rows: Row[] = [],
    title = "";
  if (ctx.page === "timelines") {
    title = "Timelines · overwrite a date if it cannot be met";
    rows = book
      .filter((c) => c.stage === "booked" && c.timeline.handover)
      .map((c) => ({
        c,
        kind: "timeline",
        sub:
          salesLine(c) +
          " · handover " +
          day(c.timeline.handover) +
          " · " +
          c.timeline.type,
        pill: (
          <Pill
            tone={c.approvals.timeline === "Overwritten" ? "yellow" : "grey"}
          >
            {c.approvals.timeline === "Overwritten"
              ? "Overwritten"
              : "From Sales"}
          </Pill>
        ),
      }));
  } else if (ctx.page === "make") {
    title = "Proposals to make";
    rows = all
      .filter((c) => c.stage === "design" && c.design.step === "withDesign")
      .sort(
        (a, b) =>
          Date.parse(a.design.stepAt || "1970-01-01") -
          Date.parse(b.design.stepAt || "1970-01-01"),
      )
      .map((c) => {
        const late =
            c.design.promisedBy && c.design.promisedBy < window.Kit.today(),
          days = window.Kit.daysSince(c.design.stepAt);
        return {
          c,
          kind: "proposal",
          sub:
            (c.design.designer
              ? "Designer " + c.design.designer
              : "No designer allotted") +
            " · " +
            salesLine(c) +
            " · " +
            c.city +
            (isRevision(c) ? " · " + c.design.revisions.at(-1)!.reason : ""),
          pill: (
            <Pill
              tone={
                late || days >= 3 ? "red" : isRevision(c) ? "yellow" : "blue"
              }
            >
              {c.design.promisedBy
                ? "Promised " +
                  short(c.design.promisedBy) +
                  (late ? " · late" : "")
                : (isRevision(c) ? "Revision" : "First proposal") +
                  " · " +
                  days +
                  " day(s)"}
            </Pill>
          ),
        };
      });
  } else {
    title =
      (
        {
          sales: "With Sales",
          booking: "Approved · booking amount coming in",
          all: "All pre-design clients",
        } as Record<string, string>
      )[ctx.page] || "All pre-design clients";
    const inDesign = all.filter((c) => c.stage === "design"),
      set =
        ctx.page === "booking"
          ? book
          : ctx.page === "sales"
            ? inDesign.filter((c) =>
                ["drf", "toShare"].includes(c.design.step || "drf"),
              )
            : [...inDesign, ...book];
    rows = set.map((c) => {
      const p = c.design.proposals.at(-1);
      return {
        c,
        sub:
          salesLine(c) +
          " · " +
          (c.design.designer ? "designer " + c.design.designer + " · " : "") +
          (c.stage === "design"
            ? p
              ? "V" + p.v + " · " + window.Kit.short(p.amount)
              : "No proposal yet"
            : "collected " +
              window.Kit.short(L.collected(c)) +
              " of " +
              window.Kit.short(L.bookingDue(c))) +
          " · revised " +
          c.design.revisions.length +
          " time(s)",
        pill: (
          <Pill tone="blue">
            {c.stage === "design"
              ? STEP[c.design.step || "drf"]
              : !L.tokenIn(c)
                ? "Token not in"
                : window.Kit.short(L.bookingLeft(c)) + " to go"}
          </Pill>
        ),
      };
    });
  }
  return (
    <div className="onelist">
      <List
        title={title}
        ctx={ctx}
        rows={rows}
        tools={
          <span className="sub">
            {ctx.page === "make"
              ? all.filter((c) =>
                  c.design.proposals.some(
                    (p) => window.Kit.hoursSince(p.receivedAt) <= 72,
                  ),
                ).length + " sent in 3 days"
              : ctx.page === "timelines"
                ? ""
                : "The sales person is the point of contact"}
          </span>
        }
        empty="Nobody here right now."
      />
    </div>
  );
}
export function Board({ all, ctx }: { all: Client[]; ctx: Context }) {
  const rows = all.filter(rules().handed).filter((c) => !c.factoryAt);
  const table = useRef<HTMLDivElement>(null);
  useCardLabels(table);
  return (
    <section className="card design-board">
      <div className="design-table-scroll cardify" ref={table}>
        <div className="board-row head design-board-grid">
          {[
            "Client (" + rows.length + ")",
            "Designer",
            "Sales manager",
            "Est. value",
            "1 · Site measurement",
            "2 · Design",
            "3 · Appliances",
            "4 · EPT",
            "5 · PDI",
          ].map((t) => (
            <b key={t}>{t}</b>
          ))}
        </div>
        {rows.map((c) => (
          <div className="board-row design-board-grid" key={c.id}>
            <button
              className="who design-client-pick"
              onClick={() => ctx.show("client", c.id)}
            >
              <b>{c.name}</b>
              <small>
                {c.pid} · {rules().postStage(c)}
              </small>
            </button>
            <span>{c.design.designer || "Not allotted"}</span>
            <span>{c.sm || window.People.owner(c)}</span>
            <b>{window.Kit.short(rules().totals(c).total)}</b>
            <FlowSteps c={c} ctx={ctx} />
          </div>
        ))}
      </div>
      {!rows.length && (
        <div className="empty">No post-design clients right now.</div>
      )}
      <div className="board-key">
        <span className="due">Red: not started</span>
        <span className="notdue">Yellow: in progress</span>
        <span className="paid">Green: done</span>
        <span>Order: site measurement, design, appliances, EPT, PDI</span>
      </div>
    </section>
  );
}
export function Tracker({ all, ctx }: { all: Client[]; ctx: Context }) {
  const L = rules(),
    rows = all.filter(L.handed);
  const table = useRef<HTMLDivElement>(null);
  useCardLabels(table);
  return (
    <section className="card design-board">
      <div className="design-table-scroll cardify" ref={table}>
        <div className="board-row head design-tracker-grid">
          {[
            "Client (" + rows.length + ")",
            "Now at",
            "Designer",
            "Meas · Design · Appl · EPT",
            "80% payment",
            "Factory",
            "PDI",
            "Dispatch",
            "Handover",
            "Paid of order",
          ].map((t) => (
            <b key={t}>{t}</b>
          ))}
        </div>
        {rows.map((c) => {
          const d = L.dates(c),
            t = L.totals(c),
            row = L.productionRow(c),
            s = { measure: L.measureState(c), ...L.flowState(c) },
            states = [
              s.measure.state,
              s.design.state,
              s.appliances.state,
              s.ept.state,
            ],
            p = L.flow(c).pdi;
          return (
            <button
              className="board-row design-tracker-grid"
              key={c.id}
              onClick={() => ctx.show("client", c.id)}
            >
              <span className="who">
                <b>{c.name}</b>
                <small>
                  {c.pid} · {window.People.owner(c)}
                </small>
              </span>
              <Pill>{L.postStage(c)}</Pill>
              <span>{c.design.designer || "Not allotted"}</span>
              <span>
                {states.filter((s) => s === "done").length} of 4 done
                <small>
                  {states
                    .map((s) =>
                      s === "done" ? "G" : s === "progress" ? "Y" : "R",
                    )
                    .join(" · ")}
                </small>
              </span>
              <span className={row.due ? "due" : "paid"}>
                {window.Kit.lakh(row.due || row.amount)}
                <small>{row.due ? "to collect" : "received"}</small>
              </span>
              <span>
                {c.factoryAt ? "In" : "Not yet"}
                <small>{c.factoryAt && "since " + short(c.factoryAt)}</small>
              </span>
              {(["pdi", "dispatch", "handover"] as const).map((k) => (
                <span
                  className={d && d[k] < window.Kit.today() ? "due" : "notdue"}
                  key={k}
                >
                  {k === "pdi" && p.approvedAt
                    ? "Approved"
                    : d
                      ? short(d[k])
                      : "Not set"}
                  <small>
                    {k === "pdi" && p.approvedAt
                      ? short(p.approvedAt)
                      : d
                        ? d[k] < window.Kit.today()
                          ? "date passed"
                          : "planned"
                        : ""}
                  </small>
                </span>
              ))}
              <span>
                {window.Kit.lakh(L.collected(c))} of {window.Kit.lakh(t.total)}
                <small>
                  {t.total ? Math.round((L.collected(c) / t.total) * 100) : 0}%
                  paid
                </small>
              </span>
            </button>
          );
        })}
      </div>
      {!rows.length && <div className="empty">No post-design orders yet.</div>}
      <div className="board-key">
        Done · Needs attention · Planned · amounts in ₹ lakh
      </div>
    </section>
  );
}
export function Post({ all, ctx }: { all: Client[]; ctx: Context }) {
  const L = rules();
  if (ctx.page === "board") return <Board all={all} ctx={ctx} />;
  if (ctx.page === "tracker") return <Tracker all={all} ctx={ctx} />;
  if (ctx.page === "pdi")
    return (
      <div className="onelist">
        <PdiList all={all} ctx={ctx} />
      </div>
    );
  if (ctx.page === "factory")
    return (
      <div className="twolists">
        <List
          title="PDI approved · waiting for Accounts"
          ctx={ctx}
          empty="Nothing waiting. Orders go to the factory once 80% is in and Accounts gives the go-ahead."
          rows={factoryWaiting(all).map((c) => ({
            c,
            sub:
              (c.design.designer || "No designer") +
              " · PDI approved " +
              day(L.flow(c).pdi.approvedAt),
            pill: (
              <Pill tone={L.productionRow(c).due ? "red" : "yellow"}>
                {L.productionRow(c).due
                  ? window.Kit.short(L.productionRow(c).due) + " to collect"
                  : "80% in · Accounts to approve"}
              </Pill>
            ),
          }))}
        />
        <List
          title="Shot to factory"
          ctx={ctx}
          empty="No orders in the factory yet."
          rows={factoryGone(all)
            .sort((a, b) =>
              (b.factoryAt || "").localeCompare(a.factoryAt || ""),
            )
            .map((c) => ({
              c,
              sub:
                "since " +
                day(c.factoryAt) +
                " · " +
                mailLine(c) +
                " · " +
                L.postStage(c),
              pill: <Pill tone="green">{L.postStage(c)}</Pill>,
            }))}
        />
      </div>
    );
  const rows = all
    .filter(L.handed)
    .filter((c) => owed(c) > 0)
    .sort((a, b) => owed(b) - owed(a));
  return (
    <div className="onelist">
      <List
        title="Collections"
        ctx={ctx}
        tools={
          <span>
            {window.Kit.short(rows.reduce((n, c) => n + owed(c), 0))} to collect
            from {rows.length} client(s)
          </span>
        }
        empty="Nothing left to collect from post-design clients."
        rows={rows.map((c) => {
          const ledger = L.ledger(c).filter((r) => r.name !== "Booking"),
            next = ledger.find((r) => r.due > 0);
          return {
            c,
            sub:
              (c.design.designer
                ? "Designer " + c.design.designer
                : "Designer not allotted") +
              " · order " +
              window.Kit.short(L.totals(c).total) +
              " · received " +
              window.Kit.short(L.collected(c)) +
              " · " +
              ledger
                .map(
                  (r) =>
                    r.name +
                    " " +
                    r.percent +
                    "%: " +
                    (r.due ? window.Kit.short(r.due) + " due" : "paid"),
                )
                .join(" · "),
            pill: (
              <Pill tone="red">
                {next
                  ? "Next: " + next.name + " " + window.Kit.short(next.due)
                  : "All in"}
              </Pill>
            ),
          };
        })}
      />
    </div>
  );
}
