import { useState } from "react";
import type { Context, Person } from "./types";
import {
  architects,
  assignArchitect,
  clients,
  rules,
  type Architect,
  type SalesClient,
} from "./model";
import { Button, Field, now, Select } from "./ui";
import { Grid } from "./lists";
export function ArchitectPage({ ctx }: { ctx: Context }) {
  const [adding, setAdding] = useState(false),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState({ name: "", firm: "", phone: "", rate: "" });
  const all = architects(),
    L = rules();
  const used = (a: Architect) =>
    clients(ctx.everyone).filter(
      (c) => c.architectInvolved && c.architectId === a.id && c.stage !== "bin",
    );
  const edit = (
    a: Architect,
    key: "name" | "firm" | "phone" | "rate",
    value: string,
  ) =>
    ctx.update(() => {
      if (key === "rate") a.rate = Number(value.replace(/[^0-9.-]/g, "")) || 0;
      else a[key] = value.trim();
      clients(ctx.everyone)
        .filter((c) => c.architectInvolved && c.architectId === a.id)
        .forEach((c) => assignArchitect(c, a.id));
    });
  if (window.Kit.bankOnly())
    return (
      <div className="page architects-page">
        <div className="empty">Not shown in this view.</div>
      </div>
    );
  return (
    <div className="page architects-page">
      <div className="page-h">
        <div>
          <h1>Architects</h1>
          <p>{all.length} architects · Manage contacts and commission rates.</p>
        </div>
        <Field
          label="Find an architect"
          value={search}
          immediate
          onCommit={setSearch}
          type="search"
        />
        <Button onClick={() => setAdding(!adding)}>
          {adding ? "Close form" : "+ Add architect"}
        </Button>
      </div>
      {adding && (
        <section
          className="card card-b architect-create"
          aria-label="Add architect"
        >
          <h2>New architect</h2>
          <div className="flexrow">
            {(["name", "firm", "phone", "rate"] as const).map((key) => (
              <Field
                key={key}
                label={"New architect " + (key === "rate" ? "commission" : key)}
                value={draft[key]}
                immediate
                onCommit={(v) => setDraft((x) => ({ ...x, [key]: v }))}
              />
            ))}
            <Button
              tone="dark"
              disabled={!draft.name.trim()}
              onClick={() => {
                ctx.update(() => {
                  const n =
                    Math.max(
                      0,
                      ...all.map((a) => Number(a.id.replace("a", "")) || 0),
                    ) + 1;
                  const list = (window.Kit.store.data.architects ||=
                    []) as Architect[];
                  list.push({
                    id: "a" + String(n).padStart(3, "0"),
                    name: draft.name.trim(),
                    firm: draft.firm.trim(),
                    phone: draft.phone.trim(),
                    rate: Number(draft.rate.replace(/[^0-9.-]/g, "")) || 0,
                  });
                });
                setDraft({ name: "", firm: "", phone: "", rate: "" });
              }}
            >
              Add architect
            </Button>
          </div>
        </section>
      )}
      <Grid
        title="Architects"
        empty={search.trim() ? "No architects match your search." : "No architects yet. Use Add architect to get started."}
        heads={[
          "Architect",
          "Firm",
          "Phone",
          "Commission %",
          "Orders",
          "Order value",
          "Success fees",
          "",
        ]}
        cols="minmax(140px,1.5fr) minmax(120px,1.2fr) minmax(100px,1fr) 90px 60px minmax(100px,1fr) minmax(100px,1fr) 76px"
        rows={all
          .filter(
            (a) =>
              !search.trim() ||
              (a.name + " " + a.firm + " " + a.phone)
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
          )
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((a) => {
            const mine = used(a);
            return {
              id: a.id,
              cells: [
                <Field
                  label="Architect name"
                  value={a.name}
                  onCommit={(v) => edit(a, "name", v)}
                />,
                <Field
                  label="Firm"
                  value={a.firm}
                  onCommit={(v) => edit(a, "firm", v)}
                />,
                <Field
                  label="Phone"
                  value={a.phone}
                  onCommit={(v) => edit(a, "phone", v)}
                />,
                <Field
                  label="Commission percent"
                  value={a.rate}
                  onCommit={(v) => edit(a, "rate", v)}
                />,
                mine.length || "",
                window.Kit.short(
                  mine.reduce((t, c) => t + L.totals(c).base, 0),
                ),
                window.Kit.short(
                  mine.reduce((t, c) => t + L.totals(c).success, 0),
                ),
                mine.length ? (
                  <span className="pill grey">In use</span>
                ) : (
                  <Button
                    tone="small architect-remove"
                    onClick={() =>
                      ctx.update(() => {
                        all.splice(all.indexOf(a), 1);
                      })
                    }
                  >
                    Remove
                  </Button>
                ),
              ],
            };
          })}
      />
    </div>
  );
}
export function teamNumbers(all: SalesClient[], p: Person) {
  const L = rules(),
    mine = all.filter(
      (c) =>
        (c.owner || window.People.list[0].id) === p.id &&
        !["bin", "lost"].includes(c.stage),
    ),
    booked = mine.filter((c) => c.stage === "booked"),
    post = mine.filter((c) => c.stage === "post"),
    money = [...booked, ...post];
  const sum = (list: SalesClient[], fn: (c: SalesClient) => number) =>
      list.reduce((n, c) => n + fn(c), 0),
    today = new Date(),
    key = (d: Date) =>
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  const month = (m: string) => {
    const b = money.filter(
      (c) =>
        c.bookedAt && window.Kit.ymd(new Date(c.bookedAt)).slice(0, 7) === m,
    );
    return {
      booked: b.length,
      value: sum(b, (c) => L.totals(c).total),
      got: money.reduce(
        (n, c) =>
          n +
          c.payment.receipts
            .filter(
              (r) => r.status === "Confirmed" && r.date?.slice(0, 7) === m,
            )
            .reduce((n, r) => n + Number(r.amount), 0),
        0,
      ),
    };
  };
  const a = month(key(today)),
    z = month(key(new Date(today.getFullYear(), today.getMonth() - 1, 1))),
    share = sum(money, L.bookingDue);
  return {
    now: a,
    before: z,
    trend:
      a.got + a.value > z.got + z.value
        ? "up"
        : a.got + a.value < z.got + z.value
          ? "down"
          : "same",
    rate: share
      ? Math.round((Math.min(sum(money, L.collected), share) / share) * 100)
      : null,
    clients: mine.length,
    leads: mine.filter((c) => c.stage === "qualified").length,
    notCalled: mine.filter((c) => c.stage === "qualified" && !c.spokeAt).length,
    design: mine.filter((c) => c.stage === "design").length,
    booked: booked.length,
    post: post.length,
    value: sum(money, (c) => L.totals(c).total),
    got: sum(money, L.collected),
    left: sum(booked, L.bookingLeft),
  };
}
export function TeamPage({ ctx }: { ctx: Context }) {
  const me = window.People.list[0],
    below = window.People.list.filter((p) => p.reportsTo === me.id),
    rows = [me, ...below].map((p) => ({
      p,
      n: teamNumbers(clients(ctx.everyone), p),
    })),
    team = rows.filter((r) => r.p.id !== me.id),
    names = (list: typeof rows) =>
      list.map((r) => r.p.name).join(", ") || "Nobody",
    active = team
      .filter((r) => r.n.now.got + r.n.now.value > 0)
      .sort(
        (a, b) => b.n.now.got - a.n.now.got || b.n.now.value - a.n.now.value,
      ),
    rated = team
      .filter((r) => r.n.rate != null)
      .sort((a, b) => b.n.rate! - a.n.rate!),
    short = window.Kit.short;
  const stats = [
    [
      "Best in " + new Date().toLocaleDateString("en-GB", { month: "long" }),
      active[0]?.p.name || "Nobody yet",
      active[0]
        ? "collected " +
          short(active[0].n.now.got) +
          " · booked " +
          short(active[0].n.now.value) +
          " this month"
        : "No booking or payment recorded this month",
    ],
    [
      "Up from last month",
      names(team.filter((r) => r.n.trend === "up")),
      "booked and collected more than last month",
    ],
    [
      "Down from last month",
      names(team.filter((r) => r.n.trend === "down")),
      "booked and collected less than last month",
    ],
    [
      "Best at collecting, overall",
      rated[0]
        ? rated[0].p.name + " · " + rated[0].n.rate + "%"
        : "No bookings yet",
      rated.length > 1
        ? "lowest: " +
          rated.at(-1)!.p.name +
          " · " +
          rated.at(-1)!.n.rate +
          "% of booking share collected"
        : "share of the booking amount collected",
    ],
    [
      "No clients yet",
      names(team.filter((r) => !r.n.clients)),
      "nothing to judge them on yet",
    ],
  ];
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h1>My team</h1>
          <p>
            {below.length} people report to you ·{" "}
            {rows.reduce((n, r) => n + r.n.clients, 0)} clients · order value{" "}
            {short(rows.reduce((n, r) => n + r.n.value, 0))} · collected{" "}
            {short(rows.reduce((n, r) => n + r.n.got, 0))} ·{" "}
            {short(rows.reduce((n, r) => n + r.n.left, 0))} of booking amount
            still to collect
          </p>
        </div>
      </div>
      <div className="statrow">
        {stats.map(([title, big, note]) => (
          <div className="stat" key={title}>
            <span>{title}</span>
            <b style={{ fontSize: 16 }}>{big}</b>
            <span>{note}</span>
          </div>
        ))}
      </div>
      <Grid
        title="My team"
        heads={[
          "Person",
          "Role",
          "Clients",
          "Leads",
          "Not called",
          "In design",
          "Booked",
          "Order value",
          "Collected",
          "Booking amount left",
          "Collected %",
          "This month against last",
        ]}
        cols="1.3fr 110px repeat(5,.6fr) repeat(3,1fr) .8fr 1.5fr"
        rows={rows.map(({ p, n }) => ({
          id: p.id,
          cells: [
            <b>
              {p.name}
              {p.role !== p.startedAs && <small> · was {p.startedAs}</small>}
            </b>,
            p.id === me.id ? (
              p.role
            ) : (
              <Select
                label={"Role of " + p.name}
                value={p.role}
                options={window.People.ROLES}
                placeholder={false}
                onChange={(role) =>
                  ctx.update(() => {
                    const saved = (window.Kit.store.data.people ||=
                      {}) as Record<string, unknown>;
                    saved[p.id] = { role, changedAt: now(), by: me.id };
                  })
                }
              />
            ),
            n.clients,
            n.leads,
            n.notCalled,
            n.design,
            n.booked + n.post,
            short(n.value),
            short(n.got),
            short(n.left),
            n.rate == null ? "" : n.rate + "%",
            <>
              <b>
                {n.trend === "up"
                  ? "▲ Up"
                  : n.trend === "down"
                    ? "▼ Down"
                    : n.clients
                      ? "■ Same"
                      : "No clients yet"}
              </b>
              {n.clients > 0 && (
                <small>
                  {" "}
                  · {short(n.now.got + n.now.value)} against{" "}
                  {short(n.before.got + n.before.value)}
                </small>
              )}
            </>,
          ],
        }))}
      />
      <div className="sub">
        To see one person's own screens, pick them in "Viewing" at the top. Full
        charts are under the "{window.Kit.headName()}" screen. Up and down
        compare this month with last month: order value booked plus money
        received.
      </div>
    </div>
  );
}
