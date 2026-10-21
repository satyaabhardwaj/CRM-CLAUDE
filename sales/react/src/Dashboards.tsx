import { useState } from "react";
import type { Context } from "./types";
import { clients, rules, type SalesClient } from "./model";
import { Button, Card, day, Field, money, Pill, Select } from "./ui";
import { ClientList, FollowUps, Grid, stageNames } from "./lists";
import { ArchitectPage, TeamPage } from "./MasterPages";
import { Tracker } from "./Tracker";
export const steps: Record<string, [string, string, string]> = {
  drf: ["Send DRF to Design", "grey", "You"],
  withDesign: ["Pending with designer", "blue", "Design"],
  toShare: ["Share proposal with client", "grey", "You"],
  withClient: ["Waiting for client", "blue", "Client"],
};
const short = (n: number) => window.Kit.short(n);
export function Qualified({ ctx }: { ctx: Context }) {
  const [psm, setPsm] = useState("");
  const sent = (c: SalesClient) =>
    c.psm ? "PSM " + c.psm : "SM " + (c.sm || window.People.list[0].name);
  const list = clients(ctx.clients);
  const rank = (c: SalesClient) =>
    ({ High: 0, Medium: 1, Low: 2 })[c.priority || ""] ?? 3;
  return (
    <div className="twolists">
      <ClientList
        ctx={ctx}
        title="Qualified leads"
        remove="clients"
        empty="No qualified leads right now."
        tools={
          <Select
            label="Sent by"
            value={psm}
            options={[...new Set(list.map(sent))].sort()}
            onChange={setPsm}
            placeholder="Everyone"
          />
        }
        rows={list
          .filter((c) => !psm || sent(c) === psm)
          .sort(
            (a, b) =>
              rank(a) - rank(b) ||
              Date.parse(a.receivedAt) - Date.parse(b.receivedAt),
          )
          .map((c) => ({
            c,
            priority: c.priority,
            sub: sent(c) + " · " + c.city + " · " + c.product,
            pill: <Pill tone={rules().clock(c)[1]}>{rules().clock(c)[0]}</Pill>,
          }))}
      />
      <FollowUps ctx={ctx} />
    </div>
  );
}
export function Design({ ctx }: { ctx: Context }) {
  const [step, setStep] = useState("");
  const rank = (c: SalesClient) =>
    c.design.newProposal
      ? 0
      : (steps[c.design.step || "drf"] || steps.drf)[2] === "You"
        ? 1
        : 2;
  return (
    <div className="twolists">
      <FollowUps ctx={ctx} stage="design" title="Calls and follow-ups" />
      <ClientList
        title="Proposals"
        ctx={ctx}
        remove="clients"
        empty="No clients in design right now."
        tools={
          <Select
            label="Step"
            value={step}
            options={Object.entries(steps).map(([key, v]) => [key, v[0]])}
            onChange={setStep}
            placeholder="Every step"
          />
        }
        rows={clients(ctx.clients)
          .filter((c) => !step || (c.design.step || "drf") === step)
          .sort(
            (a, b) =>
              rank(a) - rank(b) ||
              Date.parse(a.design.stepAt || "") -
                Date.parse(b.design.stepAt || ""),
          )
          .map((c) => {
            const p = c.design.proposals.at(-1),
              s =
                c.design.newProposal && c.design.step === "toShare"
                  ? ["Just in from Design", "green"]
                  : steps[c.design.step || "drf"] || steps.drf;
            return {
              c,
              sub:
                (p
                  ? "V" +
                    p.v +
                    " · " +
                    short(p.amount) +
                    " · came " +
                    c.design.proposals.length +
                    " time(s) · revised " +
                    c.design.revisions.length +
                    " time(s)"
                  : "No proposal yet") +
                " · " +
                Math.floor(
                  (Date.now() - Date.parse(c.design.stepAt || "")) / 86400000,
                ) +
                " day(s)",
              pill: <Pill tone={s[1]}>{s[0]}</Pill>,
            };
          })}
      />
    </div>
  );
}
export function Booked({ ctx }: { ctx: Context }) {
  const L = rules();
  return (
    <Grid
      title="Booked · collecting"
      cols="1.6fr 1fr .6fr 1fr 1fr 1fr 1.2fr .9fr 1.1fr"
      heads={[
        "Client",
        "Order value",
        "Plan",
        "Booking share",
        "Collected",
        "Left",
        "Progress",
        "Expected by",
        "Accounts",
      ]}
      empty="No booked clients are collecting right now."
      rows={clients(ctx.clients)
        .slice()
        .sort(
          (a, b) =>
            Number(b.approvals.booking === "Rejected") -
              Number(a.approvals.booking === "Rejected") ||
            L.bookingLeft(b) - L.bookingLeft(a),
        )
        .map((c) => {
          const due = L.bookingDue(c),
            got = L.collected(c),
            pct = due ? Math.min(100, Math.round((got / due) * 100)) : 0;
          return {
            id: c.id,
            onClick: () => ctx.select(c.id),
            cells: [
              <>
                <b>{c.name}</b> <span className="sub">{c.pid}</span>
                {!L.tokenIn(c) && (
                  <Pill tone="red">
                    {window.Kit.bankOnly() ? "No payment yet" : "Token not in"}
                  </Pill>
                )}
              </>,
              short(L.totals(c).total),
              c.payment.plan,
              short(due),
              short(got),
              short(L.bookingLeft(c)),
              <span className="flexrow">
                <span className="bar">
                  <i style={{ width: pct + "%" }} />
                </span>
                {pct}%
              </span>,
              day(c.payment.expectedBy),
              <Pill
                tone={
                  c.approvals.booking === "Rejected"
                    ? "red"
                    : c.approvals.booking === "Approved"
                      ? "green"
                      : "blue"
                }
              >
                {c.approvals.booking === "Pending"
                  ? "With Accounts"
                  : c.approvals.booking}
              </Pill>,
            ],
          };
        })}
    />
  );
}
interface Approval {
  c: SalesClient;
  what: string;
  who: string;
  amount: number;
  sentAt?: string;
  status: string;
  note?: string;
}
export function approvalRows(list: SalesClient[]): Approval[] {
  const out: Approval[] = [];
  for (const c of list.filter((c) => !["bin", "lost"].includes(c.stage))) {
    c.payment.receipts.forEach((r, i) =>
      out.push({
        c,
        what:
          (i === 0 ? "Token" : "Payment") +
          " · " +
          (r.kind === "md" ? "management discount" : "in bank"),
        who: "Accounts",
        amount: Number(r.amount) || 0,
        sentAt: r.requestedAt || r.date,
        status:
          r.status === "Requested"
            ? "Pending"
            : r.status === "Confirmed"
              ? "Approved"
              : "Rejected",
        note: r.reason,
      }),
    );
    if (
      ["token", "booked", "post"].includes(c.stage) &&
      c.approvals.booking !== "Not sent"
    )
      out.push({
        c,
        what: "Booking",
        who: "Accounts",
        amount: rules().totals(c).total,
        sentAt: c.submittedAt,
        status: c.approvals.booking,
        note: c.approvalNotes?.booking?.reason,
      });
    const p = c.design.proposals.at(-1);
    if (c.stage === "design" && c.design.step === "withClient" && p)
      out.push({
        c,
        what: "Proposal V" + p.v,
        who:
          (c.architectInvolved ?? c.source === "Architect reference")
            ? "Client and architect"
            : "Client",
        amount: p.amount,
        sentAt: p.sharedAt || c.design.stepAt,
        status: "Pending",
      });
  }
  return out;
}
function Approvals({ ctx }: { ctx: Context }) {
  const [status, setStatus] = useState("Pending"),
    [who, setWho] = useState("");
  const all = approvalRows(clients(ctx.all).filter(ctx.match));
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Sent for approvals</h1>
          <p>Everything you have sent for a yes, and what came back</p>
        </div>
        <Select
          label="Sent to"
          value={who}
          options={["Accounts", "Client"]}
          placeholder="Sent to anyone"
          onChange={setWho}
        />
      </div>
      <div className="pay-tiles">
        {["Pending", "Approved", "Rejected"].map((s) => (
          <button
            key={s}
            type="button"
            className={"pay-tile" + (status === s ? " on" : "")}
            onClick={() => setStatus(status === s ? "" : s)}
          >
            <span>{s}</span>
            <b>{all.filter((r) => r.status === s).length}</b>
          </button>
        ))}
      </div>
      <Grid
        title="Requests"
        heads={[
          "Client",
          "What was sent",
          "Sent to",
          "Amount",
          "Sent on",
          "Waiting",
          "Answer",
        ]}
        cols="1.6fr 1.6fr 1.1fr 1fr 1fr .9fr 1.8fr"
        rows={all
          .filter(
            (r) =>
              (!status || r.status === status) &&
              (!who || r.who.startsWith(who)),
          )
          .sort(
            (a, b) => Date.parse(a.sentAt || "") - Date.parse(b.sentAt || ""),
          )
          .map((r, i) => ({
            id: r.c.id + i,
            onClick: () => ctx.open(r.c),
            cells: [
              <b>
                {r.c.name} <small>{r.c.pid}</small>
              </b>,
              r.what,
              r.who,
              r.amount ? short(r.amount) : "",
              r.sentAt ? day(r.sentAt) : "Not recorded",
              r.status === "Pending"
                ? Math.floor(
                    (Date.now() - Date.parse(r.sentAt || "")) / 86400000,
                  ) + " day(s)"
                : "",
              <>
                <Pill
                  tone={
                    r.status === "Rejected"
                      ? "red"
                      : r.status === "Approved"
                        ? "green"
                        : "yellow"
                  }
                >
                  {r.status}
                </Pill>
                {r.note && <span className="msg">{r.note}</span>}
              </>,
            ],
          }))}
      />
    </div>
  );
}
export function paymentInfo(c: SalesClient) {
  const date = rules().payDue(c),
    late = date
      ? Math.round(
          (Date.parse(window.Kit.today()) - Date.parse(date)) / 86400000,
        )
      : 0;
  return {
    date,
    amount: rules().atStake(c),
    when: !date
      ? "none"
      : late > 0
        ? "overdue"
        : late === 0
          ? "today"
          : "later",
    text: !date
      ? "No date set"
      : late > 0
        ? "Overdue · " + late + " day(s)"
        : late === 0
          ? "Due today"
          : "Due " + day(date),
    tone: late > 0 ? "red" : late === 0 ? "yellow" : "grey",
  };
}
function Payments({ ctx }: { ctx: Context }) {
  const [when, setWhen] = useState(""),
    [date, setDate] = useState("");
  const all = clients(ctx.all)
    .filter(
      (c) =>
        ["token", "booked"].includes(c.stage) &&
        rules().atStake(c) > 0 &&
        ctx.match(c),
    )
    .map((c) => ({ c, x: paymentInfo(c) }));
  const rows = all
    .filter((r) =>
      when === "pick" ? !date || r.x.date === date : !when || r.x.when === when,
    )
    .sort((a, b) => (a.x.date || "9999").localeCompare(b.x.date || "9999"));
  const sum = (list: typeof all) => list.reduce((n, r) => n + r.x.amount, 0);
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Payments</h1>
          <p>
            What you still have to collect, by due date · {short(sum(all))} from{" "}
            {all.length} clients
          </p>
        </div>
        <Select
          label="Due date"
          value={when}
          options={[
            ["overdue", "Overdue"],
            ["today", "Due today"],
            ["later", "Coming up"],
            ["none", "No date set"],
            ["pick", "Pick a date"],
          ]}
          placeholder="Every due date"
          onChange={setWhen}
        />
        {when === "pick" && (
          <Field label="Date" value={date} type="date" onCommit={setDate} />
        )}
      </div>
      <div className="pay-tiles">
        {[
          ["overdue", "Overdue"],
          ["today", "Due today"],
          ["later", "Coming up"],
          ["none", "No date set"],
        ].map(([key, label]) => {
          const list = all.filter((r) => r.x.when === key);
          return (
            <button
              key={key}
              type="button"
              className={"pay-tile" + (when === key ? " on" : "")}
              onClick={() => setWhen(when === key ? "" : key)}
            >
              <span>{label}</span>
              <b>
                {short(sum(list))} ({list.length})
              </b>
            </button>
          );
        })}
      </div>
      <div className="twolists">
        {[false, true].map((paid) => {
          const mine = rows.filter((r) => rules().tokenIn(r.c) === paid);
          return (
            <ClientList
              key={String(paid)}
              ctx={ctx}
              title={
                (paid
                  ? "Booked"
                  : window.Kit.bankOnly()
                    ? "No payment yet"
                    : "Token not in") +
                " · " +
                short(sum(mine))
              }
              rows={mine.map(({ c, x }) => ({
                c,
                sub:
                  (paid
                    ? "Rest of booking amount · collected " +
                      money(rules().collected(c)) +
                      " of " +
                      money(rules().bookingDue(c))
                    : c.payment.receipts.some((r) => r.status === "Requested")
                      ? "Token with Accounts"
                      : "Token or booking amount") +
                  " · order " +
                  short(rules().totals(c).total) +
                  " · " +
                  c.payment.plan +
                  " plan · " +
                  short(x.amount),
                pill: <Pill tone={x.tone}>{x.text}</Pill>,
              }))}
            />
          );
        })}
      </div>
    </div>
  );
}
function Incentive({ ctx }: { ctx: Context }) {
  const rows = clients(ctx.all).filter((c) =>
      ["token", "booked", "post"].includes(c.stage),
    ),
    L = rules(),
    due = rows.reduce((n, c) => n + L.bookingDue(c), 0),
    got = rows.reduce((n, c) => n + L.collected(c), 0),
    booked = rows.filter((c) => c.stage !== "token");
  const facts = [
    ["Orders approved by clients", rows.length],
    ["Order value", short(rows.reduce((n, c) => n + L.totals(c).total, 0))],
    [
      "Booked (token confirmed)",
      short(booked.reduce((n, c) => n + L.totals(c).total, 0)) +
        " (" +
        booked.length +
        ")",
    ],
    ["Booking share due", short(due)],
    ["Collected", short(got)],
    [
      "Collected against booking share",
      due ? Math.round((got / due) * 100) + "%" : "Nothing due yet",
    ],
  ];
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Incentive</h1>
          <p>For the person chosen in "Viewing" at the top</p>
        </div>
      </div>
      <div className="inc-grid">
        <Card title="The rule" tone="violet">
          <div className="line rule">
            <span>70% and above</span>
            <b className="inc-big">{money(50000)}</b>
          </div>
          <div className="sub">Released quarterly.</div>
          <div className="line rule">
            <span>Below 70%</span>
            <b className="inc-big">Nil</b>
          </div>
          <div className="msg">
            Still to be set: what the 70% is measured on. Until then no
            percentage is shown.
          </div>
        </Card>
        <Card title="Your numbers so far">
          <div className="facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <div className="sub">
            These are counted from your clients. They are shown for reference
            and are not yet the incentive measure.
          </div>
        </Card>
      </div>
    </div>
  );
}
function Bin({ ctx }: { ctx: Context }) {
  const all = clients(ctx.all),
    deleted = all.filter((c) => c.stage === "bin" && c.binned),
    calls = all.filter((c) => c.stage !== "bin" && c.binnedCall);
  const restore = (c: SalesClient, call: boolean) => {
    if (call && c.binnedCall) {
      c.nextFollowUp = c.binnedCall.nextFollowUp;
      c.retry = c.binnedCall.retry;
      delete c.binnedCall;
    } else if (c.binned) {
      c.stage = c.binned.stage;
      delete c.binned;
    }
  };
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Bin</h1>
          <p>
            Nothing here is lost. Restore puts it back exactly where it was.
          </p>
        </div>
        {deleted.length + calls.length > 0 && (
          <Button
            onClick={() =>
              ctx.update(() => {
                deleted.forEach((c) => restore(c, false));
                calls.forEach((c) => restore(c, true));
              })
            }
          >
            Restore everything
          </Button>
        )}
      </div>
      <div className="twolists">
        {[false, true].map((call) => (
          <Card
            key={String(call)}
            title={call ? "Deleted follow-up calls" : "Deleted clients"}
          >
            {(call ? calls : deleted)
              .sort(
                (a, b) =>
                  Date.parse((call ? b.binnedCall : b.binned)!.at) -
                  Date.parse((call ? a.binnedCall : a.binned)!.at),
              )
              .map((c) => (
                <div className="mini" key={c.id}>
                  <span className="who">
                    <b>{c.name}</b>
                    <small>
                      {call
                        ? c.binnedCall?.nextFollowUp
                          ? "Was due " + day(c.binnedCall.nextFollowUp)
                          : "Call-again timer"
                        : "From " + stageNames[c.binned!.stage]}{" "}
                      · deleted {day((call ? c.binnedCall : c.binned)!.at)}
                    </small>
                  </span>
                  <Button onClick={() => ctx.update(() => restore(c, call))}>
                    Restore
                  </Button>
                </div>
              ))}
            {!(call ? calls : deleted).length && (
              <div className="empty">
                No deleted {call ? "follow-up calls" : "clients"}.
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
export const routes = [
  {
    id: "architects",
    title: "Architects",
    short: "Architects",
    page: true,
    small: true,
    Component: ArchitectPage,
  },
  {
    id: "qualified",
    title: "Qualified leads",
    short: "Leads",
    Component: Qualified,
  },
  { id: "design", title: "In design", short: "Design", Component: Design },
  {
    id: "booked",
    title: "Booked · collecting",
    short: "Booked",
    Component: Booked,
  },
  {
    id: "approvals",
    title: "Sent for approvals",
    short: "Approvals",
    page: true,
    flow: true,
    Component: Approvals,
  },
  {
    id: "team",
    title: "My team",
    short: "Team",
    page: true,
    Component: TeamPage,
  },
  {
    id: "payments",
    title: "Payments",
    short: "Pay",
    page: true,
    Component: Payments,
  },
  {
    id: "tracker",
    title: "Client tracker",
    short: "Tracker",
    page: true,
    Component: Tracker,
  },
  {
    id: "incentive",
    title: "Incentive",
    short: "Incentive",
    page: true,
    Component: Incentive,
  },
  {
    id: "bin",
    title: "Bin",
    short: "Bin",
    page: true,
    small: true,
    Component: Bin,
  },
];
