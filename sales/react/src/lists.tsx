import { useState, type ReactNode } from "react";
import type { Context } from "./types";
import { binClient, clients, rules, type SalesClient } from "./model";
import { Button, day, now, Pill, Select } from "./ui";
export interface ListRow {
  c: SalesClient;
  sub?: ReactNode;
  pill?: ReactNode;
  priority?: string;
}
export function ClientList({
  title,
  rows,
  ctx,
  tools,
  empty = "Nobody here right now.",
  remove,
}: {
  title: string;
  rows: ListRow[];
  ctx: Context;
  tools?: ReactNode;
  empty?: string;
  remove?: "clients" | "calls";
}) {
  const [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  return (
    <section className="card list">
      <div className="list-h">
        <h1>
          {title}
          <span className="count">{rows.length}</span>
        </h1>
        {tools}
        {remove && rows.length > 0 && (
          <Button
            tone="small"
            onClick={() => {
              setSelecting(!selecting);
              setSelected([]);
            }}
          >
            {selecting ? "Cancel" : "Select"}
          </Button>
        )}
      </div>
      {selecting && (
        <div className="flexrow">
          <Button onClick={() => setSelected(rows.map((r) => r.c.id))}>
            Select all
          </Button>
          <Button
            tone="warn"
            disabled={!selected.length || ctx.readOnly}
            onClick={() => {
              ctx.update(() =>
                rows.forEach(({ c }) => {
                  if (!selected.includes(c.id)) return;
                  if (remove === "clients") binClient(c);
                  else {
                    c.binnedCall = {
                      at: now(),
                      nextFollowUp: c.nextFollowUp || "",
                      retry: c.retry || null,
                    };
                    c.nextFollowUp = "";
                    c.retry = null;
                  }
                }),
              );
              setSelected([]);
              setSelecting(false);
            }}
          >
            Move to Bin ({selected.length})
          </Button>
        </div>
      )}
      <div className="rows">
        {rows.length ? (
          rows.map(({ c, sub, pill, priority }) => (
            <div className="mini" key={c.id}>
              {selecting && (
                <input
                  type="checkbox"
                  aria-label={"Select " + c.name}
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, c.id]
                        : selected.filter((id) => id !== c.id),
                    )
                  }
                />
              )}
              <button
                type="button"
                className="sales-list-pick"
                onClick={() => ctx.open(c)}
              >
                <span className="who">
                  <b>
                    {c.name}
                    {priority && (
                      <i className={"heat " + priority.toLowerCase()}>
                        {priority}
                      </i>
                    )}
                  </b>
                  <small>{sub}</small>
                </span>
                {pill}
              </button>
            </div>
          ))
        ) : (
          <div className="empty">{empty}</div>
        )}
      </div>
    </section>
  );
}
export const stageNames: Record<string, string> = {
  qualified: "Qualified",
  design: "In design",
  token: "Token due",
  booked: "Booked",
  post: "Post-design",
  lost: "Disqualified",
};
const about: Record<string, string> = {
  qualified: "First conversation",
  design: "Proposal follow-up",
  token: "Collect token",
  booked: "Collect booking amount",
};
export function followUp(c: SalesClient) {
  if (c.retry) {
    const left = (Date.parse(c.retry.dueAt) - Date.now()) / 3600000;
    return {
      why: "RNR",
      when: left >= 0 ? "today" : "overdue",
      text:
        "Try " +
        (c.retry.tries + 1) +
        " · " +
        Math.round(Math.abs(left)) +
        "h " +
        (left >= 0 ? "left" : "late"),
      tone: left >= 0 ? "yellow" : "red",
      order: Date.parse(c.retry.dueAt),
    };
  }
  const next = c.nextFollowUp || "",
    timed = next.length > 10,
    at = Date.parse(timed ? next : next + "T23:59:00"),
    late = Math.round(
      (Date.parse(window.Kit.today()) - Date.parse(next.slice(0, 10))) /
        86400000,
    ),
    clock = timed
      ? new Date(next).toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "",
    passed = timed && at < Date.now();
  return {
    why: about[c.stage],
    when: late > 0 || passed ? "overdue" : late === 0 ? "today" : "later",
    order: at,
    text:
      late > 0
        ? "Overdue · " + late + " day(s)"
        : late === 0
          ? passed
            ? "Overdue · was " + clock
            : "Today" + (clock ? " · " + clock : "")
          : day(next) + (clock ? " · " + clock : ""),
    tone: late > 0 || passed ? "red" : late === 0 ? "yellow" : "grey",
  };
}
export function FollowUps({
  ctx,
  stage,
  title = "Follow-up calls",
}: {
  ctx: Context;
  stage?: string;
  title?: string;
}) {
  const [filter, setFilter] = useState("");
  const due = clients(ctx.all)
    .filter(
      (c) =>
        about[c.stage] &&
        ctx.match(c) &&
        (!stage || c.stage === stage) &&
        (c.retry || c.nextFollowUp) &&
        !(c.stage === "qualified" && !c.spokeAt && !c.retry),
    )
    .map((c) => ({ c, f: followUp(c) }))
    .filter((x) => !filter || x.f.when === filter || x.f.why === filter)
    .sort((a, b) => a.f.order - b.f.order);
  return (
    <ClientList
      title={title}
      ctx={ctx}
      remove="calls"
      empty="No follow-up calls are due."
      tools={
        <Select
          label="Type of follow-up"
          value={filter}
          options={
            [
              ["overdue", "Overdue"],
              ["today", "Due today"],
              ["later", "Coming up"],
              ...Object.values(about)
                .filter((v) => !stage || v === about[stage])
                .map((v) => [v, v]),
              ["RNR", "RNR, call again"],
            ] as [string, string][]
          }
          onChange={setFilter}
          placeholder="All follow-ups"
        />
      }
      rows={due.map(({ c, f }) => ({
        c,
        sub:
          (stage ? "" : stageNames[c.stage] + " · ") +
          f.why +
          (rules().atStake(c)
            ? " · " + window.Kit.short(rules().atStake(c))
            : ""),
        pill: <Pill tone={f.tone}>{f.text}</Pill>,
      }))}
    />
  );
}
export function Grid({
  title,
  heads,
  rows,
  cols,
  tools,
  empty = "Nothing here.",
}: {
  title: string;
  heads: ReactNode[];
  rows: { id: string; cells: ReactNode[]; onClick?: () => void }[];
  cols: string;
  tools?: ReactNode;
  empty?: string;
}) {
  return (
    <section className="card list">
      <div className="list-h">
        <h1>{title}</h1>
        {tools}
      </div>
      <div className="rows">
        <div className="row head" style={{ gridTemplateColumns: cols }}>
          {heads.map((h, i) => (
            <div key={i}>{h}</div>
          ))}
        </div>
        {rows.length ? (
          rows.map((r) =>
            r.onClick ? (
              <button
                key={r.id}
                type="button"
                className="row"
                style={{ gridTemplateColumns: cols }}
                onClick={r.onClick}
              >
                {r.cells.map((cell, i) => (
                  <span key={i}>{cell}</span>
                ))}
              </button>
            ) : (
              <div
                key={r.id}
                className="row"
                style={{ gridTemplateColumns: cols }}
              >
                {r.cells.map((cell, i) => (
                  <span key={i}>{cell}</span>
                ))}
              </div>
            ),
          )
        ) : (
          <div className="empty">{empty}</div>
        )}
      </div>
    </section>
  );
}
