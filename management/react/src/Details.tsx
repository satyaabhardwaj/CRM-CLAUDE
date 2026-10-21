import type { Client, Show, Person } from "./types";
import { K, L, S, stats, worst, short, ago } from "./model";
import { Card, Facts, Pill, Modal } from "./ui";
export function ClientDetail({ c, close }: { c: Client; close: () => void }) {
  const flags = worst(c),
    p = c.design.proposals.at(-1),
    firstShare = c.design.proposals.find((x) => x.sharedAt),
    token = c.payment.receipts[0],
    dates = L().dates(c),
    ball = S().ball(c),
    today = K().today(),
    hasOrder = ["token", "booked"].includes(c.stage);
  return (
    <Modal
      title={c.name}
      tags={
        flags.length ? (
          flags.slice(0, 2).map((f, i) => (
            <Pill key={i} tone={f[1]}>
              {f[0]}
            </Pill>
          ))
        ) : (
          <Pill tone="green">Nothing wrong</Pill>
        )
      }
      sub={`${c.pid} · ${window.People.owner(c)} · ${S().STAGE[c.stage] || c.stage} · ${c.city} · ${c.product} · waiting on ${ball[0]} for ${ball[1]} day(s)`}
      close={close}
    >
      <div className="cols">
        <Card title="Money" tone="green">
          <Facts
            items={[
              [
                hasOrder ? "Order value" : "Latest proposal",
                S().value(c) ? K().money(S().value(c)) : "",
              ],
              ["Payment plan", hasOrder ? c.payment.plan : ""],
              ["Booking share", hasOrder ? K().money(L().bookingDue(c)) : ""],
              ["Collected", hasOrder ? K().money(L().collected(c)) : ""],
              [
                "Still to collect",
                hasOrder ? K().money(L().bookingLeft(c)) : "",
                hasOrder && L().bookingLeft(c) > 0,
              ],
              [
                "Expected by",
                short(c.payment.expectedBy),
                !!c.payment.expectedBy &&
                  c.payment.expectedBy < today &&
                  L().bookingLeft(c) > 0,
              ],
              [
                "Sent to Accounts",
                c.payment.receipts.length
                  ? c.payment.receipts.length + " time(s)"
                  : "",
              ],
              [
                "Rejected by Accounts",
                String(
                  c.payment.receipts.filter((r) => r.status === "Rejected")
                    .length || "",
                ),
                c.payment.receipts.some((r) => r.status === "Rejected"),
              ],
            ]}
          />
        </Card>
        <Card title="Dates" tone="violet">
          <Facts
            items={[
              ["Lead received", short(c.receivedAt)],
              [
                "First conversation",
                short(c.spokeAt),
                !!c.missed24 ||
                  (c.stage === "qualified" && L().firstCall(c).late),
              ],
              [
                "Sent to designer",
                short(c.design.sentAt) +
                  (c.design.designer ? " · " + c.design.designer : ""),
              ],
              [
                "Latest proposal",
                p ? "V" + p.v + " · " + short(p.receivedAt) : "",
              ],
              [
                "First shared with client",
                firstShare ? short(firstShare.sharedAt) : "",
              ],
              [
                "Times revised",
                String(c.design.revisions.length || ""),
                c.design.revisions.length >= 2,
              ],
              ["Client approved", short(c.approvedAt)],
              ["Token", token ? short(token.date) + " · " + token.status : ""],
              [
                "Next follow-up",
                short(c.nextFollowUp),
                !!c.nextFollowUp && c.nextFollowUp < today,
              ],
              [
                "Handover",
                dates
                  ? short(dates.handover) + " " + dates.handover.slice(0, 4)
                  : "",
              ],
            ]}
          />
        </Card>
        <Card
          title="What is wrong"
          tone={flags.some((f) => f[1] === "red") ? "red" : "grey"}
        >
          {flags.length ? (
            flags.map((f, i) => (
              <div className="line rule" key={i}>
                <Pill tone={f[1]}>{f[0]}</Pill>
                <span className="sub">{f[2]}</span>
              </div>
            ))
          ) : (
            <p>Nothing is wrong on this client.</p>
          )}
          <b className="sub">Calls logged · {c.contacts.length}</b>
          {c.contacts.length ? (
            c.contacts.slice(0, 5).map((e, i) => (
              <div className="hint" key={i}>
                {K().dayTime(e.at)} · {e.type} · {e.outcome}
                {e.note ? " · " + e.note : ""}
              </div>
            ))
          ) : (
            <div className="hint">No calls have been logged.</div>
          )}
        </Card>
      </div>
    </Modal>
  );
}
export function PersonDetail({
  p,
  live,
  show,
  close,
}: {
  p: Person;
  live: Client[];
  show: Show;
  close: () => void;
}) {
  const s = stats(p, live),
    rank: Record<string, number> = { red: 0, yellow: 1, blue: 2 },
    flagged = s.mine
      .filter((c) => S().flags(c).length)
      .sort((a, b) => rank[worst(a)[0][1]] - rank[worst(b)[0][1]]);
  const item = (c: Client, problem = false) => (
    <button
      key={c.id}
      className="mini"
      onClick={() => show({ kind: "client", id: c.id })}
    >
      <span className="who">
        <b>{c.name}</b>
        <small>
          {S().STAGE[c.stage]}
          {S().value(c) ? " · " + K().short(S().value(c)) : ""} · last activity{" "}
          {ago(S().lastTouch(c))}
        </small>
      </span>
      <Pill tone={problem ? worst(c)[0][1] : "grey"}>
        {problem ? worst(c)[0][0] : S().STAGE[c.stage]}
      </Pill>
    </button>
  );
  return (
    <Modal
      title={p.name}
      tags={
        <>
          <Pill>{p.role}</Pill>
          <Pill tone={s.problems ? "red" : "green"}>
            {s.problems
              ? s.problems + " client(s) with a problem"
              : "All clear"}
          </Pill>
        </>
      }
      sub={
        s.mine.length +
        " clients · last activity " +
        (s.touched ? ago(s.touched) : "none")
      }
      close={close}
    >
      <div className="cols">
        <Card title="Numbers" tone="grey">
          <Facts
            items={[
              ["Clients", String(s.mine.length)],
              ["Calls logged", String(s.calls)],
              ["Leads not called", String(s.notCalled), s.notCalled > 0],
              ["24-hour rule broken", String(s.broken), s.broken > 0],
              ["Follow-ups late", String(s.late), s.late > 0],
              ["Sitting on DRF or proposal", String(s.sitting), s.sitting > 0],
              ["Revisions sent", String(s.revisions)],
              ["Booked", K().short(s.bookedValue) + " (" + s.bookedCount + ")"],
              ["Collected", K().short(s.got)],
              ["Still to collect", K().short(s.left), s.left > 0],
            ]}
          />
        </Card>
        <section className="card">
          <div className="card-h t-red">
            <h2>Problems</h2>
            <span>{flagged.length}</span>
          </div>
          <div className="rows">
            {flagged.length ? (
              flagged.map((c) => item(c, true))
            ) : (
              <div className="empty">No problems.</div>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-h t-grey">
            <h2>All clients</h2>
            <span>{s.mine.length}</span>
          </div>
          <div className="rows">
            {s.mine.length ? (
              s.mine
                .slice()
                .sort((a, b) => S().value(b) - S().value(a))
                .map((c) => item(c))
            ) : (
              <div className="empty">No clients.</div>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
