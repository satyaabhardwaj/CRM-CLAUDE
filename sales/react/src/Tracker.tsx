import { useState } from "react";
import type { Context } from "./types";
import {
  clients,
  rules,
  type Dates,
  type SalesClient,
  type FormProps,
} from "./model";
import { Button, Card, day, money, Pill, Select } from "./ui";
import { Grid } from "./lists";
export const boardColumns = [
  "Token",
  "Booking",
  "EPT",
  "Production drawing",
  "PDI",
  "Dispatch",
  "Handover",
];
export function TrackerDetails({ c, ctx }: FormProps) {
  const at = nowAt(c),
    who = pointOfContact(c),
    L = rules(),
    d = L.dates(c);
  const facts = (list: [string, string | undefined][]) => (
    <div className="facts">
      {list.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value || "Not yet"}</b>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <div className="sheet-h">
        <div>
          <div className="flexrow">
            <h2>{c.name}</h2>
            <Pill tone={at[1]}>Now at {at[0]}</Pill>
          </div>
          <div className="sub">
            {c.pid} · {c.cid} · {c.city} · {c.product}
            {c.phone && " · " + c.phone}
          </div>
        </div>
        <Button tone="small" onClick={ctx.close}>
          Close
        </Button>
      </div>
      <div className="sheet-b">
        <div className="cols">
          <Card title="Who has this client" tone="violet">
            {facts([
              ["Point of contact", who[0]],
              ["Designer allotted", c.design.designer],
              ["Sales person", window.People.owner(c)],
              ["Now at", at[0]],
              ["Timeline", d ? c.approvals.timeline : ""],
              ["Booking approval", c.approvals.booking],
            ])}
            {(c.news || []).slice(0, 3).map((n, i) => (
              <div className="hint" key={i}>
                {new Date(n.at).toLocaleString()} · {n.text}
              </div>
            ))}
          </Card>
          <Card title="Money" tone="green">
            {facts([
              ["Order value", money(L.totals(c).total)],
              ["Payment plan", L.PLANS[c.payment.plan].label],
              ["Paid so far", money(L.collected(c))],
              ["Booking amount left", money(L.bookingLeft(c))],
            ])}
            {c.payment.receipts.length ? (
              c.payment.receipts.map((r, i) => (
                <div className="line rule" key={i}>
                  <span>
                    <b>{money(r.amount)}</b> · {day(r.date)} ·{" "}
                    {r.mode || "Mode not set"}
                  </span>
                  <Pill
                    tone={
                      r.status === "Confirmed"
                        ? "green"
                        : r.status === "Rejected"
                          ? "red"
                          : "blue"
                    }
                  >
                    {r.status}
                  </Pill>
                </div>
              ))
            ) : (
              <p>No payment has been recorded.</p>
            )}
          </Card>
          <Card title="Stages and dates" tone="blue">
            {boardColumns
              .filter((col) => !window.Kit.bankOnly() || col !== "Token")
              .map((col) => {
                const x = boardCell(c, col);
                return (
                  <div className="line rule" key={col}>
                    <span>
                      <b>{col}</b>
                      {x?.date && " · " + day(x.date)}
                    </span>
                    {x ? (
                      <span className="flexrow">
                        {x.amount ? money(x.amount) : ""}
                        <Pill
                          tone={
                            x.state === "paid"
                              ? "green"
                              : x.state === "due"
                                ? "red"
                                : "grey"
                          }
                        >
                          {
                            {
                              paid: "Paid",
                              due: "Due now",
                              notdue: "Not due yet",
                            }[x.state]
                          }
                        </Pill>
                      </span>
                    ) : (
                      <span>No payment at this stage</span>
                    )}
                  </div>
                );
              })}
          </Card>
        </div>
      </div>
    </>
  );
}
export function pointOfContact(c: SalesClient) {
  return c.stage === "post" ||
    (c.stage === "booked" && rules().bookingLeft(c) === 0)
    ? [
        c.design.designer
          ? "Designer " + c.design.designer
          : "Designer not allotted",
        "point of contact now",
      ]
    : ["You", "until booking share is collected"];
}
export function nowAt(c: SalesClient) {
  const L = rules();
  if (c.stage === "booked" && !L.tokenIn(c)) return ["Token", "red"];
  if (c.stage === "booked" && L.bookingLeft(c) > 0)
    return ["Booking", "yellow"];
  const d = L.dates(c),
    today = window.Kit.today();
  if (!d) return ["With designer", "blue"];
  if (today < d.signoff) return ["Production drawing", "blue"];
  if (today < d.pdi) return ["PDI", "blue"];
  if (today < d.dispatch) return ["Dispatch", "blue"];
  return [today < d.handover ? "Handover" : "Handed over", "green"];
}
export function boardCell(
  c: SalesClient,
  col: string,
): {
  amount: number;
  state: string;
  date?: string;
  text?: string;
  note?: string;
} | null {
  const L = rules(),
    d = L.dates(c);
  if (col === "Token") {
    const paid = c.payment.receipts.find((r) => r.status === "Confirmed"),
      sent = c.payment.receipts.find((r) => r.status === "Requested");
    return paid
      ? { amount: Number(paid.amount) || 0, state: "paid", date: paid.date }
      : {
          amount: Number(sent?.amount) || 0,
          state: "due",
          text: sent ? undefined : "Due",
          date: sent?.date,
          note: sent ? "with Accounts" : "",
        };
  }
  if (col === "Booking") {
    const left = L.bookingLeft(c);
    return left > 0
      ? { amount: left, state: "due", date: c.payment.expectedBy, note: "left" }
      : { amount: L.bookingDue(c), state: "paid", date: c.bookedAt };
  }
  const plan: Record<string, string> = {
      EPT: "EPT",
      "Production drawing": "Production",
      PDI: "PDI",
      Handover: "EHOD",
    },
    keys: Record<string, keyof Dates> = {
      "Production drawing": "signoff",
      PDI: "pdi",
      Dispatch: "dispatch",
      Handover: "handover",
    },
    share = L.shares(c).find((s) => s.name === plan[col]),
    date = d && keys[col] ? d[keys[col]] : "";
  if (!share && !date) return null;
  return {
    amount: share?.amount || 0,
    state: "notdue",
    date,
    text: share ? undefined : " ",
  };
}
export function Tracker({ ctx }: { ctx: Context }) {
  const [when, setWhen] = useState("all"),
    [due, setDue] = useState("all"),
    L = rules(),
    columns = boardColumns.filter(
      (c) => !window.Kit.bankOnly() || c !== "Token",
    );
  const rows = clients(ctx.all).filter((c) => {
    if (!["token", "booked", "post"].includes(c.stage) || !ctx.match(c))
      return false;
    if (when === "all") return true;
    const date = new Date(),
      start = new Date(date);
    if (when === "week")
      start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    if (when === "month") start.setDate(1);
    const got = window.Kit.ymd(new Date(c.approvedAt || c.receivedAt));
    return got >= window.Kit.ymd(start) && got <= window.Kit.today();
  });
  const shows = (cell: ReturnType<typeof boardCell>) =>
    cell && (due === "all" || cell.state === due);
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>Client tracker</h1>
          <p>
            Where each client is, who has them, what is paid and what date is
            next · Offer basic value{" "}
            {window.Kit.short(rows.reduce((n, c) => n + L.totals(c).base, 0))} ·
            amounts in ₹ lakh
          </p>
        </div>
        <Select
          label="Date"
          value={when}
          options={[
            ["all", "Overall"],
            ["today", "Today"],
            ["week", "This week"],
            ["month", "This month"],
          ]}
          placeholder={false}
          onChange={setWhen}
        />
        <Select
          label="Due or not due"
          value={due}
          options={[
            ["all", "Overall"],
            ["due", "Due"],
            ["notdue", "Not due"],
          ]}
          placeholder={false}
          onChange={setDue}
        />
      </div>
      <Grid
        title="Client tracker"
        cols={"1.9fr 1.2fr 1.2fr repeat(" + columns.length + ",1fr) 1.1fr"}
        heads={[
          <>Client ({rows.length})</>,
          "Now at",
          "Point of contact",
          ...columns.map((col) => {
            const hit = rows
              .map((c) => boardCell(c, col))
              .filter((x) => shows(x) && x!.amount);
            return (
              <>
                <b>{col}</b>
                <span className={"box" + (hit.length ? "" : " none")}>
                  {hit.length
                    ? window.Kit.lakh(hit.reduce((n, x) => n + x!.amount, 0)) +
                      " (" +
                      hit.length +
                      ")"
                    : "None"}
                </span>
              </>
            );
          }),
          "Paid of order",
        ]}
        rows={rows.map((c) => {
          const at = nowAt(c),
            who = pointOfContact(c),
            total = L.totals(c).total,
            got = L.collected(c);
          return {
            id: c.id,
            onClick: () => ctx.select(c.id),
            cells: [
              <span className="who">
                <b>{c.name}</b>
                <small>
                  {c.pid} · {c.product} · {c.payment.plan} plan
                </small>
              </span>,
              <Pill tone={at[1]}>{at[0]}</Pill>,
              <span className="who">
                <b>{who[0]}</b>
                <small>{who[1]}</small>
              </span>,
              ...columns.map((col) => {
                const x = boardCell(c, col);
                return shows(x) ? (
                  <span className="tl-cell" title={col + " · " + x!.state}>
                    <b className={"num " + x!.state}>
                      {x!.text || window.Kit.lakh(x!.amount)}
                    </b>
                    <small>
                      {[x!.date ? day(x!.date) : "", x!.note]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                ) : (
                  <span className="nil" />
                );
              }),
              <span className="who">
                <b>
                  {window.Kit.lakh(got)} of {window.Kit.lakh(total)}
                </b>
                <small>
                  {total ? Math.round((got / total) * 100) + "% paid" : ""}
                </small>
              </span>,
            ],
          };
        })}
      />
      <div className="board-key">
        <span className="paid">Paid</span>
        <span className="due">Due now</span>
        <span className="notdue">Not due yet</span>
        <span>
          The date under each amount is when it was paid or when it is planned
        </span>
      </div>
    </div>
  );
}
