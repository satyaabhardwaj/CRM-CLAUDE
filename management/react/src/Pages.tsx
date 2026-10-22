import type { Client, Show } from "./types";
import { useRef } from "react";
import { useCardLabels } from "../../../backend/react/src/Shell";
import {
  K,
  S,
  stats,
  overview,
  ago,
  worst,
  verdict,
  clientRows,
} from "./model";
import { Pill, Select } from "./ui";
export function Overview({
  shown,
  live,
  who,
  show,
}: {
  shown: Client[];
  live: Client[];
  who: string;
  show: Show;
}) {
  const m = overview(shown);
  const tiles: [string, string, string, string, boolean][] = [
    [
      "Open orders",
      K().short(m.value) + " (" + m.orders + ")",
      shown.length + " clients",
      "grey",
      false,
    ],
    [
      "Collected",
      K().short(m.got),
      m.left + m.got
        ? Math.round((m.got / (m.left + m.got)) * 100) + "% of booking share"
        : "",
      "green",
      false,
    ],
    [
      "Still to collect",
      K().short(m.left),
      m.owing + " client(s)",
      "red",
      m.left > 0,
    ],
    [
      "Clients with a problem",
      String(m.redCount),
      m.troubled.length - m.redCount + " more to watch",
      "red",
      m.redCount > 0,
    ],
  ];
  return (
    <div className="mg">
      <section className="mg-tiles" aria-label="Management summary">
        {tiles.map(([label, value, note, tone, bad]) => (
          <div className={"mg-tile" + (bad ? " alarm" : "")} key={label}>
            <span>{label}</span>
            <b className="num">{value}</b>
            <small className={tone}>{note}</small>
          </div>
        ))}
      </section>
      <div className="mg-wait">
        <span className="sub">Waiting on</span>
        {m.waiting.map((x) => (
          <span className="chipline" key={x.name}>
            <b>
              {x.name} {x.count}
            </b>
            {x.count ? " · " + x.days + " day(s) avg" : ""}
          </span>
        ))}
      </div>
      <div className="mg-two">
        <section className="card">
          <div className="card-h">
            <h2>Team</h2>
            <span>Click to open</span>
          </div>
          <div className="rows">
            {window.People.list.map((p) => {
              const s = stats(p, live),
                chips: [number, string][] = [
                  [s.broken, "24h broken"],
                  [s.late, "follow-ups late"],
                  [s.sitting, "sitting on it"],
                  [s.notCalled, "not called"],
                ];
              return (
                <button
                  key={p.id}
                  className={"person" + (who === p.id ? " on" : "")}
                  onClick={() => show({ kind: "person", id: p.id })}
                >
                  <span className="line">
                    <span>
                      <b>{p.name}</b>{" "}
                      <span className="sub">
                        {p.role} · {s.mine.length} clients
                      </span>
                    </span>
                    <span className="sub">
                      {s.touched ? ago(s.touched) : ""}
                    </span>
                  </span>
                  <span className="line">
                    <span className="num">
                      Booked {K().short(s.bookedValue)} ({s.bookedCount}) ·
                      collected {K().short(s.got)}
                    </span>
                    <b className={"num " + (s.left ? "bad" : "")}>
                      {K().short(s.left)} to collect
                    </b>
                  </span>
                  <span className="flexrow">
                    {chips.some((x) => x[0]) ? (
                      chips
                        .filter((x) => x[0])
                        .map(([n, label]) => (
                          <Pill
                            key={label}
                            tone={label === "not called" ? "yellow" : "red"}
                          >
                            {n} {label}
                          </Pill>
                        ))
                    ) : (
                      <Pill tone="green">All clear</Pill>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="card">
          <div className="list-h">
            <h1>
              Needs a push<span className="count">{m.troubled.length}</span>
            </h1>
          </div>
          <div className="rows">
            {m.troubled.length ? (
              m.troubled.map((c) => {
                const f = worst(c);
                return (
                  <button
                    className="item management-item"
                    key={c.id}
                    onClick={() => show({ kind: "client", id: c.id })}
                  >
                    <span className="who">
                      <b className={f[0][1] === "red" ? "bad" : ""}>{c.name}</b>
                      <small>
                        {window.People.owner(c)} · {S().STAGE[c.stage]}
                        {S().value(c) ? " · " + K().short(S().value(c)) : ""} ·
                        last activity {ago(S().lastTouch(c))}
                        {f.length > 1 ? " · " + (f.length - 1) + " more" : ""}
                      </small>
                    </span>
                    <Pill tone={f[0][1]}>{f[0][0]}</Pill>
                  </button>
                );
              })
            ) : (
              <div className="empty">Nothing needs a push right now.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
export function PeoplePage({ live, show }: { live: Client[]; show: Show }) {
  const rows = window.People.list
    .map((p) => {
      const s = stats(p, live);
      return {
        p,
        s,
        v: verdict(s),
        ball: s.mine.filter((c) => S().ball(c)[0] === "Sales"),
      };
    })
    .sort((a, b) => b.v[2] - a.v[2]);
  const table = useRef<HTMLDivElement>(null);
  useCardLabels(table);
  type Row = (typeof rows)[number];
  const defs: [string, (r: Row) => number, boolean][] = [
    ["Clients", (r) => r.s.mine.length, false],
    ["Not called", (r) => r.s.notCalled, true],
    ["24h broken", (r) => r.s.broken, true],
    ["Follow-ups late", (r) => r.s.late, true],
    ["Sitting on it", (r) => r.s.sitting, true],
    ["Waiting on them", (r) => r.ball.length, true],
    [
      "Calls per client",
      (r) =>
        r.s.mine.length
          ? Math.round((r.s.calls / r.s.mine.length) * 10) / 10
          : 0,
      false,
    ],
  ];
  return (
    <div className="mg">
      <div className="mg-wait sub">
        Worst first. Lagging = 30% or more of their clients have a red problem.
        Watch = 10% or more. The highest number in each problem column is red.
      </div>
      <section className="card management-table">
        <div className="management-scroll cardify" ref={table}>
          <div className="row head management-people-row">
            {[
              "Sales person",
              "Verdict",
              ...defs.map((d) => d[0]),
              "Booked",
              "Collected",
              "To collect",
              "Last activity",
            ].map((t) => (
              <div key={t}>{t}</div>
            ))}
          </div>
          {rows.map((r) => (
            <button
              className="row management-people-row"
              key={r.p.id}
              onClick={() => show({ kind: "person", id: r.p.id })}
            >
              <span>
                <b>{r.p.name}</b> <span className="sub">{r.p.role}</span>
              </span>
              <span>
                <Pill tone={r.v[1]}>
                  {r.v[0]} · {Math.round(r.v[2] * 100)}%
                </Pill>
              </span>
              {defs.map(([label, fn, bad]) => {
                const value = fn(r),
                  max = Math.max(...rows.map(fn));
                return (
                  <span
                    key={label}
                    className={
                      "num " +
                      (bad && max > 0 && value === max
                        ? "bad"
                        : value
                          ? ""
                          : "ok")
                    }
                  >
                    {value}
                  </span>
                );
              })}
              <span className="num">
                {K().short(r.s.bookedValue)} ({r.s.bookedCount})
              </span>
              <span className="num">{K().short(r.s.got)}</span>
              <span className={"num " + (r.s.left ? "bad" : "ok")}>
                {K().short(r.s.left)}
              </span>
              <span
                className={
                  K().daysSince(
                    new Date(r.s.touched || Date.now()).toISOString(),
                  ) >= 2
                    ? "bad"
                    : "ok"
                }
              >
                {r.s.touched ? ago(r.s.touched) : "No clients"}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
export function ClientsPage({
  shown,
  stage,
  only,
  setStage,
  setOnly,
  show,
}: {
  shown: Client[];
  stage: string;
  only: string;
  setStage: (v: string) => void;
  setOnly: (v: string) => void;
  show: Show;
}) {
  const rows = clientRows(shown, stage, only);
  const table = useRef<HTMLDivElement>(null);
  useCardLabels(table);
  return (
    <div className="mg">
      <div className="mg-wait">
        <span className="sub">{rows.length} clients · worst first</span>
        <div className="management-filters">
          <Select
            label="Stage"
            value={stage}
            onChange={setStage}
            options={[
              ["", "Every stage"],
              ...S().LIVE.map((k) => [k, S().STAGE[k]] as [string, string]),
            ]}
          />
          <Select
            label="Problems"
            value={only}
            onChange={setOnly}
            options={[
              ["", "All clients"],
              ["yes", "Only with a problem"],
            ]}
          />
        </div>
      </div>
      <section className="card management-table">
        <div className="management-scroll cardify" ref={table}>
          <div className="row head management-client-row">
            {[
              "Client",
              "Sales person",
              "Stage",
              "Value",
              "In this step",
              "Whose move",
              "Last activity",
              "Calls",
              "What is wrong",
            ].map((t) => (
              <div key={t}>{t}</div>
            ))}
          </div>
          {rows.map(({ c, f, rank }) => {
            const ball = S().ball(c),
              idle = K().daysSince(new Date(S().lastTouch(c)).toISOString());
            return (
              <button
                key={c.id}
                className={
                  "row management-client-row" + (rank === 0 ? " redrow" : "")
                }
                onClick={() => show({ kind: "client", id: c.id })}
              >
                <span>
                  <b>{c.name}</b> <span className="sub">{c.pid}</span>
                </span>
                <span>{window.People.owner(c)}</span>
                <span>{S().STAGE[c.stage]}</span>
                <span className="num">
                  {S().value(c) ? K().short(S().value(c)) : ""}
                </span>
                <span className={"num " + (ball[1] >= 3 ? "bad" : "")}>
                  {ball[1]} day(s)
                </span>
                <span className={ball[0] === "Sales" ? "" : "ok"}>
                  {ball[0]}
                </span>
                <span className={idle >= 3 ? "bad" : "ok"}>
                  {ago(S().lastTouch(c))}
                </span>
                <span className={"num " + (c.contacts.length ? "" : "ok")}>
                  {c.contacts.length}
                </span>
                <span className="flexrow">
                  {f.length ? (
                    <>
                      <Pill tone={f[0][1]}>{f[0][0]}</Pill>
                      {f.length > 1 && (
                        <span className="sub">+{f.length - 1}</span>
                      )}
                    </>
                  ) : (
                    <span className="ok">Nothing wrong</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {!rows.length && <div className="empty">No clients match.</div>}
      </section>
    </div>
  );
}
