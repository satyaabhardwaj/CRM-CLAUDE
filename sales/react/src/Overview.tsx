import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Context } from "./types";
import { clients, rules, type SalesClient } from "./model";
import { Button, day, money, now, Pill } from "./ui";
import { followUp, stageNames } from "./lists";
import { paymentInfo, steps } from "./Dashboards";
export function Summary({ ctx }: { ctx: Context }) {
  const [open, setOpen] = useState(""),
    L = rules(),
    live = clients(ctx.all).filter((c) =>
      ["qualified", "design", "token", "booked"].includes(c.stage),
    ),
    call = live.filter((c) => c.stage === "qualified" && !c.spokeAt),
    design = live.filter((c) => c.stage === "design"),
    booked = live.filter((c) => ["token", "booked"].includes(c.stage)),
    orders = [...design, ...booked],
    owing = booked.filter((c) => L.bookingLeft(c) > 0),
    paid = booked.filter((c) => L.collected(c) > 0),
    proposal = (c: SalesClient) =>
      Number(c.design.proposals.at(-1)?.amount) || 0,
    sum = (list: SalesClient[], f: (c: SalesClient) => number) =>
      list.reduce((n, c) => n + f(c), 0),
    designValue = sum(design, proposal),
    bookedValue = sum(booked, (c) => L.totals(c).total),
    pipeline = designValue + bookedValue,
    share = sum(booked, L.bookingDue),
    left = sum(booked, L.bookingLeft),
    got = sum(booked, L.collected),
    pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const tiles: {
    id: string;
    label: string;
    value: string;
    percent?: number;
    tone?: string;
    note?: string;
    list: SalesClient[];
    amount: (c: SalesClient) => string;
  }[] = [
    {
      id: "call",
      label: "Leads to call",
      value: "(" + call.length + ")",
      percent: call.length
        ? pct(call.filter((c) => !L.firstCall(c).late).length, call.length)
        : 100,
      tone: call.some((c) => L.firstCall(c).late) ? "red" : "green",
      note: "inside 24h",
      list: call,
      amount: (c) => L.clock(c)[0],
    },
    {
      id: "total",
      label: "Total orders",
      value: window.Kit.short(pipeline) + " (" + orders.length + ")",
      list: orders,
      amount: (c) =>
        money(c.stage === "design" ? proposal(c) : L.totals(c).total),
    },
    {
      id: "design",
      label: "In design",
      value: window.Kit.short(designValue) + " (" + design.length + ")",
      percent: pct(designValue, pipeline),
      tone: "blue",
      note: "of total",
      list: design,
      amount: (c) => money(proposal(c)),
    },
    {
      id: "booked",
      label: "Booked",
      value: window.Kit.short(bookedValue) + " (" + booked.length + ")",
      percent: pct(bookedValue, pipeline),
      tone: "blue",
      note: "of total",
      list: booked,
      amount: (c) => money(L.totals(c).total),
    },
    {
      id: "left",
      label: "To collect",
      value: window.Kit.short(left) + " (" + owing.length + ")",
      percent: pct(left, share),
      tone: pct(left, share) > 50 ? "red" : left ? "amber" : "green",
      note: "still unpaid",
      list: owing,
      amount: (c) => money(L.bookingLeft(c)),
    },
    {
      id: "got",
      label: "Collected",
      value: window.Kit.short(got) + " (" + paid.length + ")",
      percent: pct(Math.min(got, share), share),
      tone:
        pct(Math.min(got, share), share) >= 50
          ? "green"
          : got
            ? "amber"
            : "red",
      note: "collected",
      list: paid,
      amount: (c) => money(L.collected(c)),
    },
  ];
  const selected = tiles.find((t) => t.id === open);
  return (
    <div className="eyewrap">
      <section className="eyes" aria-label="Bird's-eye view">
        {tiles.map((t) => (
          <button
            type="button"
            className={"eye" + (t.id === open ? " on" : "")}
            key={t.id}
            aria-expanded={t.id === open}
            onClick={() => setOpen(t.id === open ? "" : t.id)}
          >
            <span>{t.label}</span>
            <b className="num">{t.value}</b>
            {t.percent != null && (
              <>
                <span className={"meter " + t.tone}>
                  <i
                    style={{
                      width: Math.max(4, Math.min(100, t.percent)) + "%",
                    }}
                  />
                </span>
                <small className={t.tone}>
                  {t.percent}% {t.note}
                </small>
              </>
            )}
          </button>
        ))}
      </section>
      {selected && (
        <section className="card eyelist">
          <div className="line">
            <b>
              {selected.label} · {selected.list.length} client(s)
            </b>
            <Button tone="small" onClick={() => setOpen("")}>
              Close
            </Button>
          </div>
          {selected.list.length ? (
            selected.list.map((c) => (
              <button
                type="button"
                key={c.id}
                className="row"
                style={{ gridTemplateColumns: "1.6fr 1.4fr 1fr 1fr" }}
                onClick={() => {
                  setOpen("");
                  ctx.open(c);
                }}
              >
                <span>
                  <b>{c.name}</b> {c.pid}
                </span>
                <span>
                  {c.city} · {c.product}
                </span>
                <span>{stageNames[c.stage]}</span>
                <b>{selected.amount(c)}</b>
              </button>
            ))
          ) : (
            <div className="empty">Nobody here right now.</div>
          )}
        </section>
      )}
    </div>
  );
}
function Box({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: string;
  items: ReactNode[];
  empty: string;
}) {
  const [wide, setWide] = useState(false);
  return (
    <section className="card">
      <div className={"card-h t-" + tone}>
        <h2>{title}</h2>
        <span>{items.length || ""}</span>
      </div>
      {items.length ? (
        wide ? (
          items
        ) : (
          items.slice(0, 3)
        )
      ) : (
        <div className="item hint">{empty}</div>
      )}
      {items.length > 3 && (
        <button
          className="item more"
          type="button"
          onClick={() => setWide(!wide)}
        >
          {wide ? "Show less" : "See all " + items.length}
        </button>
      )}
    </section>
  );
}
export function SidePanel({ ctx }: { ctx: Context }) {
  const L = rules(),
    mine = clients(ctx.all).filter(
      (c) =>
        ["qualified", "design", "token", "booked"].includes(c.stage) &&
        c.stage === ctx.dash,
    ),
    item = (
      c: SalesClient,
      text: string,
      label: string,
      tone = "grey",
      key = "",
    ) => (
      <button
        className="item"
        type="button"
        key={c.id + key}
        onClick={() => ctx.open(c)}
      >
        <div className="line">
          <b>{c.name}</b>
          <Pill tone={tone}>{label}</Pill>
        </div>
        <div className="sub">{text}</div>
      </button>
    ),
    calls = (
      <Box
        title="Call again"
        tone="amber"
        empty="Nobody to call again."
        items={mine
          .filter((c) => c.retry)
          .map((c) => {
            const f = followUp(c);
            return item(
              c,
              "RNR " + c.retry!.tries + " time(s)",
              f.text,
              f.tone,
            );
          })}
      />
    );
  if (ctx.dash === "qualified")
    return (
      <>
        <Box
          title="First call due"
          tone="blue"
          empty="Every lead has been called."
          items={mine
            .filter((c) => !c.spokeAt && !c.retry)
            .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
            .map((c) =>
              item(
                c,
                (c.psm ? "PSM " + c.psm : "Own lead") + " · " + c.city,
                ...L.clock(c),
              ),
            )}
        />
        {calls}
        <Box
          title="High priority"
          tone="red"
          empty="No high priority leads."
          items={mine
            .filter((c) => c.priority === "High")
            .map((c) =>
              item(
                c,
                (c.budget || "Budget not shared") + " · " + c.product,
                ...L.clock(c),
              ),
            )}
        />
        <Box
          title="Spoken, ready for DRF"
          tone="green"
          empty="Nobody is waiting to be accepted."
          items={mine
            .filter((c) => c.spokeAt)
            .map((c) =>
              item(
                c,
                "Accept and start the DRF",
                "Spoke " + day(c.spokeAt),
                "green",
              ),
            )}
        />
      </>
    );
  if (ctx.dash === "design")
    return (
      <>
        {[
          ["toShare", "Just in from design", "green", "No new proposal."],
          [
            "withDesign",
            "Pending with designer",
            "blue",
            "Nothing is with a designer.",
          ],
          [
            "withClient",
            "Waiting for client",
            "blue",
            "No proposal is with a client.",
          ],
          ["drf", "Send DRF", "grey", "No DRF to send."],
        ].map(([step, title, tone, empty]) => (
          <Box
            key={step}
            title={title}
            tone={tone}
            empty={empty}
            items={mine
              .filter((c) => (c.design.step || "drf") === step)
              .sort(
                (a, b) =>
                  Date.parse(a.design.stepAt || "") -
                  Date.parse(b.design.stepAt || ""),
              )
              .map((c) =>
                item(
                  c,
                  step === "withDesign"
                    ? "Designer " +
                        (c.design.designer || "not allotted") +
                        (c.design.promisedBy
                          ? " · promised " + day(c.design.promisedBy)
                          : "")
                    : step === "drf"
                      ? "Fill the DRF and allot a designer"
                      : "V" +
                        c.design.proposals.at(-1)?.v +
                        " · " +
                        money(c.design.proposals.at(-1)?.amount),
                  day(c.design.stepAt),
                  tone,
                ),
              )}
          />
        ))}
        {calls}
      </>
    );
  const approvals: ReactNode[] = [];
  mine.forEach((c) => {
    if (c.payment.receipts.some((r) => r.status === "Requested"))
      approvals.push(
        item(c, "Payment receipt to confirm", "Accounts", "blue", "receipt"),
      );
    else if (
      !L.tokenIn(c) &&
      c.payment.receipts.some((r) => r.status === "Rejected")
    )
      approvals.push(
        item(c, "Payment needs fixing", "Accounts rejected", "red", "receipt"),
      );
    for (const [key, who, what] of [
      ["plan", L.PLANS[c.payment.plan]?.approver, "Payment plan"],
      ["timeline", "Design", "Timeline"],
      ["booking", "Accounts", "Booking"],
    ])
      if (["Pending", "Rejected"].includes(c.approvals[key]))
        approvals.push(
          item(
            c,
            what +
              (c.approvals[key] === "Pending"
                ? " approval pending"
                : " needs fixing"),
            who + (c.approvals[key] === "Rejected" ? " rejected" : ""),
            c.approvals[key] === "Rejected" ? "red" : "blue",
            key,
          ),
        );
  });
  const fresh = mine
    .flatMap((c) =>
      (c.news || [])
        .filter((n) => Date.now() - Date.parse(n.at) <= 48 * 3600000)
        .map((n) => ({ c, n })),
    )
    .sort((a, b) => Date.parse(b.n.at) - Date.parse(a.n.at));
  return (
    <>
      <Box
        title="Money to collect"
        tone="red"
        empty="Nothing to collect right now."
        items={mine
          .filter((c) => L.bookingLeft(c) > 0)
          .map((c) => {
            const x = paymentInfo(c);
            return item(
              c,
              window.Kit.short(L.bookingLeft(c)) +
                " left · collected " +
                window.Kit.short(L.collected(c)),
              x.text,
              "red",
            );
          })}
      />
      <Box
        title="Approvals pending"
        tone="teal"
        empty="Nothing is waiting on anyone."
        items={approvals}
      />
      <Box
        title="Just in"
        tone="blue"
        empty="Nothing new from Design or Accounts."
        items={fresh.map(({ c, n }, i) =>
          item(c, n.text, day(n.at), n.tone, String(i)),
        )}
      />
      {calls}
    </>
  );
}
interface Notice {
  id: string;
  c: SalesClient;
  at: string;
  text: string;
  tone: string;
  unread: boolean;
  alert?: boolean;
  approval: boolean;
}
export function Notifications({
  ctx,
  writable,
}: {
  ctx: Context;
  writable: boolean;
}) {
  const [open, setOpen] = useState(false),
    [fresh, setFresh] = useState<string[]>([]),
    ref = useRef<HTMLDivElement>(null),
    me = window.People.list[0];
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes the panel, as in Design.
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  const seen = (
      (window.Kit.store.data.seen || {}) as Record<
        string,
        { at: string; alerts: Record<string, boolean> }
      >
    )[me.id] || { at: "", alerts: {} },
    notices: Notice[] = [];
  clients(ctx.all)
    .filter((c) =>
      ["qualified", "design", "token", "booked", "post"].includes(c.stage),
    )
    .forEach((c) => {
      (c.news || [])
        .filter((n) => window.Kit.newsFrom(n) !== "Sales")
        .forEach((n) =>
          notices.push({
            ...n,
            c,
            id: c.id + n.at,
            unread: n.at > seen.at,
            approval: /accounts|booking|timeline|payment|token/i.test(n.text),
          }),
        );
      window.Signals.flags(c).forEach((f) => {
        if (f[2] !== "Design" && !/accounts/i.test(f[0])) return;
        const id = c.id + "|" + f[0].replace(/[0-9]+/g, "#");
        notices.push({
          id,
          c,
          at: "",
          text: f[0],
          tone: f[1],
          alert: true,
          unread: !seen.alerts[id],
          approval: f[2] !== "Design",
        });
      });
    });
  notices.sort(
    (a, b) => Number(!!b.alert) - Number(!!a.alert) || b.at.localeCompare(a.at),
  );
  const unread = notices.filter((n) => n.unread).length;
  return (
    <div className="bell-wrap" ref={ref}>
      <button
        type="button"
        className="btn round bell"
        aria-label={"Notifications, " + unread + " new"}
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            setFresh(notices.filter((n) => n.unread).map((n) => n.id));
            if (unread && writable)
              ctx.update(() => {
                const data = (window.Kit.store.data.seen ||= {}) as Record<
                  string,
                  unknown
                >;
                data[me.id] = {
                  at: now(),
                  alerts: Object.fromEntries(
                    notices.filter((n) => n.alert).map((n) => [n.id, true]),
                  ),
                };
              });
          }
          setOpen(!open);
        }}
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && !open && (
          <span className="badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <div
          className="bell-panel"
          role="dialog"
          aria-label="Notifications"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          {[false, true].map((approval) => {
            const items = notices.filter((n) => n.approval === approval);
            return (
              <div className="bell-col" key={String(approval)}>
                <div className="note-h">
                  <b>{approval ? "Approvals" : "Design"}</b>
                  <span>{items.length || ""}</span>
                </div>
                {items.length ? (
                  items.slice(0, 30).map((n, i) => (
                    <button
                      type="button"
                      className={"note" + (fresh.includes(n.id) ? " new" : "")}
                      key={n.id + i}
                      onClick={() => {
                        setOpen(false);
                        ctx.open(n.c);
                      }}
                    >
                      <span className="who">
                        <b>{n.c.name}</b>
                        <small>{n.text}</small>
                      </span>
                      {n.alert ? (
                        <Pill tone={n.tone === "red" ? "red" : "grey"}>
                          {n.tone === "red" ? "Late" : "Waiting"}
                        </Pill>
                      ) : (
                        <span className="sub">{day(n.at)}</span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="note-empty">
                    {approval ? "No approvals yet." : "Nothing from Design."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
