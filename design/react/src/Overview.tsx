import { useEffect, useRef, useState } from "react";
import type { Context, WindowKind } from "./types";
import type { DesignClient as Client } from "./model";
import { rules } from "./model";
import { Pill } from "./ui";
import {
  tasks,
  isRevision,
  owed,
  pdiWaiting,
  pdiSince,
  factoryWaiting,
  factoryGone,
  short,
  mailLine,
} from "./selectors";
export function Summary({ all, ctx }: { all: Client[]; ctx: Context }) {
  const L = rules(),
    K = window.Kit,
    pre = all.filter(
      (c) => ["design", "booked"].includes(c.stage) && !L.handed(c),
    ),
    post = all.filter(L.handed),
    todo = tasks(all),
    make = all.filter(
      (c) => c.stage === "design" && c.design.step === "withDesign",
    ),
    late = todo.filter((t) => K.daysSince(t.at) >= 3),
    share = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0),
    onTime = todo.length ? share(todo.length - late.length, todo.length) : 100,
    sum = (list: Client[], fn: (c: Client) => number) =>
      list.reduce((n, c) => n + fn(c), 0),
    due = sum(post, (c) => L.productionRow(c).amount),
    got = sum(post, (c) => L.productionRow(c).paid),
    gone = factoryGone(all),
    waiting = factoryWaiting(all);
  const tiles: [string, string, string, string, string, string, number][] = [
    [
      "My tasks today",
      "(" + todo.length + ")",
      onTime + "% inside 3 days",
      onTime === 100 ? "green" : onTime >= 50 ? "amber" : "red",
      "today",
      "",
      onTime,
    ],
    [
      "Proposals to make",
      "(" + make.length + ")",
      make.filter(isRevision).length + " revision(s)",
      "blue",
      "pre",
      "make",
      share(make.length, pre.length),
    ],
    [
      "Post-design board",
      "(" + post.filter((c) => !c.factoryAt).length + ")",
      pdiWaiting(all).length + " waiting for PDI",
      "blue",
      "post",
      "board",
      share(
        post.filter((c) => L.flowState(c).design.state === "done").length,
        post.length,
      ),
    ],
    [
      "80% collected",
      K.short(got) + " of " + K.short(due),
      share(got, due) + "% collected",
      share(got, due) >= 50 ? "green" : got ? "amber" : "red",
      "post",
      "collections",
      share(got, due),
    ],
    [
      "Shot to factory",
      K.short(sum(gone, (c) => L.totals(c).total)) + " (" + gone.length + ")",
      waiting.length + " waiting for 80% or Accounts",
      "green",
      "post",
      "factory",
      share(gone.length, post.length),
    ],
  ];
  return (
    <section className="eyes design-eyes" aria-label="Design at a glance">
      {tiles.map(([label, value, note, tone, tab, page, pct]) => (
        <button
          key={label}
          className={
            "eye" +
            (ctx.tab === tab && (!page || ctx.page === page) ? " on" : "")
          }
          onClick={() => ctx.go(tab, page)}
        >
          <span>{label}</span>
          <b className="num">{value}</b>
          <span className={"meter " + tone}>
            <i style={{ width: Math.max(4, Math.min(100, pct)) + "%" }} />
          </span>
          <small className={tone}>{note}</small>
        </button>
      ))}
    </section>
  );
}
interface RailItem {
  c: Client;
  kind: WindowKind;
  tag: string;
  sub: string;
}
export function Rail({ all, ctx }: { all: Client[]; ctx: Context }) {
  const L = rules(),
    K = window.Kit;
  const box = (
    title: string,
    tone: string,
    items: RailItem[],
    empty: string,
  ) => (
    <section className="card" key={title}>
      <div className={"card-h t-" + tone}>
        <h2>{title}</h2>
        <span>{items.length || ""}</span>
      </div>
      {items.length ? (
        items.slice(0, 3).map((x, i) => (
          <button
            className="item"
            key={x.c.id + "-" + i}
            onClick={() => ctx.show(x.kind, x.c.id)}
          >
            <span className="line">
              <b>{x.c.name}</b>
              <Pill tone={tone}>{x.tag}</Pill>
            </span>
            <span className="sub">{x.sub}</span>
          </button>
        ))
      ) : (
        <div className="item">
          <span className="sub">{empty}</span>
        </div>
      )}
    </section>
  );
  const money: RailItem[] = all
    .filter(L.handed)
    .filter((c) => owed(c) > 0)
    .sort((a, b) => owed(b) - owed(a))
    .map((c) => ({
      c,
      kind: "client",
      tag: K.short(owed(c)),
      sub:
        "received " +
        (L.totals(c).total
          ? Math.round((L.collected(c) / L.totals(c).total) * 100)
          : 0) +
        "% · " +
        L.postStage(c),
    }));
  const fresh: RailItem[] = all
    .filter((c) =>
      (c.news || []).some(
        (n) => K.newsFrom(n) !== "Design" && K.hoursSince(n.at) <= 48,
      ),
    )
    .map((c) => {
      const n = c.news!.find((n) => K.newsFrom(n) !== "Design")!;
      return {
        c,
        kind: L.handed(c)
          ? "client"
          : c.design.step === "withDesign"
            ? "proposal"
            : "client",
        tag: K.newsFrom(n),
        sub: n.text,
      };
    });
  return (
    <>
      {ctx.tab === "post" ? (
        <>
          {box(
            "PDI approval",
            "teal",
            pdiWaiting(all).map((c) => ({
              c,
              kind: "pdi",
              tag: "PDI",
              sub:
                "ready since " +
                K.day(pdiSince(c)) +
                " · " +
                (c.design.designer || "No designer"),
            })),
            "Nothing waiting for PDI.",
          )}
          {box(
            "Shoot to factory",
            "green",
            [
              ...factoryWaiting(all).map(
                (c): RailItem => ({
                  c,
                  kind: "client",
                  tag: K.short(L.productionRow(c).due),
                  sub: "PDI approved · waiting for 80% or Accounts",
                }),
              ),
              ...factoryGone(all)
                .sort((a, b) =>
                  (b.factoryAt || "").localeCompare(a.factoryAt || ""),
                )
                .map(
                  (c): RailItem => ({
                    c,
                    kind: "client",
                    tag: "Sent",
                    sub: "since " + K.day(c.factoryAt!) + " · " + mailLine(c),
                  }),
                ),
            ],
            "Nothing for the factory yet.",
          )}
        </>
      ) : (
        <>
          {box(
            "Waiting 3 days or more",
            "amber",
            tasks(all)
              .filter((t) => K.daysSince(t.at) >= 3)
              .map((t) => ({
                c: t.c,
                kind: t.kind,
                tag: K.daysSince(t.at) + " days",
                sub:
                  t.what.replace(/ · .*$/, "") +
                  " · " +
                  (t.c.design.designer || "No designer"),
              })),
            "Nothing is waiting long.",
          )}
          {box(
            "Promised to Sales",
            "violet",
            all
              .filter(
                (c) =>
                  c.stage === "design" &&
                  c.design.step === "withDesign" &&
                  c.design.promisedBy,
              )
              .sort((a, b) =>
                a.design.promisedBy!.localeCompare(b.design.promisedBy!),
              )
              .map((c) => ({
                c,
                kind: "proposal",
                tag: short(c.design.promisedBy),
                sub:
                  (c.design.promisedBy! < K.today()
                    ? "Promise date passed"
                    : "Promised to Sales") +
                  " · " +
                  (c.design.designer || "No designer"),
              })),
            "No promise dates given.",
          )}
        </>
      )}
      {box("Money to collect", "green", money, "Nothing to collect.")}
      {box("Just in", "blue", fresh, "Nothing new from Sales or Accounts.")}
    </>
  );
}
export function Notifications({ all, ctx }: { all: Client[]; ctx: Context }) {
  const [open, setOpen] = useState(false),
    [fresh, setFresh] = useState(""),
    ref = useRef<HTMLDivElement>(null),
    seen =
      ((window.Kit.store.data.seen || {}) as Record<string, { at: string }>)
        .design?.at || "",
    sources = ["Sales", "Accounts", "Measurement"],
    cols = sources.map((src) => ({
      src,
      items: all
        .filter((c) => !["bin", "lost"].includes(c.stage))
        .flatMap((c) =>
          (c.news || [])
            .filter((n) => window.Kit.newsFrom(n) === src)
            .map((n) => ({ c, n })),
        )
        .sort((a, b) => b.n.at.localeCompare(a.n.at)),
    })),
    unread = cols.reduce(
      (n, col) => n + col.items.filter((x) => x.n.at > seen).length,
      0,
    );
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
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
  return (
    <div className="bell-wrap" ref={ref}>
      <button
        className="btn round bell"
        aria-label={"Notifications, " + unread + " new"}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setFresh(seen);
            if (unread && !ctx.readOnly)
              ctx.update(() => {
                const s =
                  (window.Kit.store.data.seen as Record<
                    string,
                    { at: string }
                  >) || {};
                s.design = { at: new Date().toISOString() };
                window.Kit.store.data.seen = s;
              });
          }
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unread && !open ? (
          <span className="badge">{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          {cols.map((col) => (
            <div className="bell-col" key={col.src}>
              <div className="note-h">
                <b>From {col.src}</b>
                <span>{col.items.length}</span>
              </div>
              {col.items.length ? (
                col.items.slice(0, 30).map(({ c, n }, i) => (
                  <div
                    key={c.id + "-" + i}
                    className={"note" + (n.at > fresh ? " new" : "")}
                  >
                    <span className="who">
                      <b>{c.name}</b>
                      <small>{n.text}</small>
                    </span>
                    <span className="sub">{window.Kit.dayTime(n.at)}</span>
                  </div>
                ))
              ) : (
                <div className="note-empty">Nothing from {col.src} yet.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
