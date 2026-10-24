import type { Context, WindowKind } from "./types";
import type { DesignClient as Client, FlowState } from "./model";
import { rules } from "./model";
import { Facts } from "./Facts";
import { Card, Pill, Button, FileLink, day, money } from "./ui";
import { STEP, short, mailLine } from "./selectors";
export const color: Record<FlowState, [string, string, string]> = {
  todo: ["#FBE4E2", "#B3261E", "Not started"],
  progress: ["#FFF3CC", "#8A5A00", "In progress"],
  done: ["#DDF3E2", "#14602F", "Done"],
};
export function FlowButton({
  state,
  small,
  label,
  word,
  onClick,
}: {
  state: FlowState;
  small?: string | string[];
  label: string;
  word?: string;
  onClick: () => void;
}) {
  const k = color[state];
  return (
    <button
      type="button"
      className="design-flow-button"
      aria-label={
        label +
        ": " +
        (word || k[2]) +
        (small ? ", " + [small].flat().join(", ") : "")
      }
      style={{ background: k[0], color: k[1], borderColor: k[1] + "33" }}
      onClick={onClick}
    >
      <b>{word || k[2]}</b>
      {(Array.isArray(small) ? small : small ? [small] : []).map((s, i) => (
        <small key={i}>{s}</small>
      ))}
    </button>
  );
}
export function FlowSteps({ c, ctx }: { c: Client; ctx: Context }) {
  const L = rules(),
    m = L.measureState(c),
    s = L.flowState(c),
    p = L.flow(c).pdi,
    open = (kind: WindowKind) => () => ctx.show(kind, c.id);
  return (
    <>
      <div>
        <FlowButton
          state={m.state}
          label="Site measurement"
          // One line (Manish, 24 Oct 2026): who goes and when, not every date.
          word={
            m.state === "done"
              ? "Done"
              : m.who
                ? "Assigned"
                : m.sentAt
                  ? "Sent"
                  : m.step
          }
          small={
            m.state === "done"
              ? "Done " +
                (m.doneAt === "recorded" ? "(recorded)" : short(m.doneAt))
              : m.who
                ? m.who + " · going " + (short(m.visit) || "date not set")
                : m.sentAt
                  ? "Not assigned yet" +
                    (m.visit ? " · asked for " + short(m.visit) : "")
                  : "Not asked yet"
          }
          onClick={open("measure")}
        />
        {m.note && <small className="sub">Note: {m.note}</small>}
      </div>
      <FlowButton
        state={s.design.state}
        label="Design"
        small={
          s.design.state === "done"
            ? "approved"
            : s.design.sent + " sent · " + s.design.returned + " returned"
        }
        onClick={open("designflow")}
      />
      <FlowButton
        state={s.appliances.state}
        label="Appliances"
        small={
          s.appliances.items +
          " item(s) · " +
          (s.appliances.state === "done"
            ? "signed"
            : s.appliances.returned + " returned")
        }
        onClick={open("appliances")}
      />
      <FlowButton
        state={s.ept.state}
        label="EPT"
        small={
          s.ept.state === "done"
            ? "signed"
            : s.ept.sent + " sent · " + s.ept.returned + " returned"
        }
        onClick={open("ept")}
      />
      <FlowButton
        state={p.approvedAt ? "done" : L.readyForPdi(c) ? "progress" : "todo"}
        word={!p.approvedAt && L.readyForPdi(c) ? "Pending" : undefined}
        label="PDI"
        small={
          p.approvedAt
            ? "approved " + short(p.approvedAt)
            : L.readyForPdi(c)
              ? "waiting for the last PDI"
              : "after steps 2 to 4"
        }
        onClick={open("pdi")}
      />
    </>
  );
}
export function ClientForm({ c, ctx }: { c: Client; ctx: Context }) {
  const L = rules(),
    b = c.design.brief,
    d = L.dates(c),
    t = L.totals(c),
    p = c.design.proposals.at(-1),
    last = L.lastSpoke(c),
    post = L.handed(c),
    fs = L.flowState(c),
    fl = L.flow(c),
    steps: [string, boolean][] = [
      ["Proposal", c.design.proposals.length > 0 || !!c.approvedAt],
      ["Client approved", !!c.approvedAt],
      ["Booking share in", post],
      ["EPT signed", fs.ept.state === "done"],
      ["Appliances signed", fs.appliances.state === "done"],
      ["Design approved", fs.design.state === "done"],
      ["PDI approved", !!fl.pdi.approvedAt],
      ["Factory", !!c.factoryAt],
    ],
    at = steps.findIndex((s) => !s[1]);
  return (
    <>
      <div className="steps">
        {steps.map(([label, done], i) => (
          <span key={label} className={done ? "done" : i === at ? "now" : ""}>
            {label}
          </span>
        ))}
      </div>
      <div className="cols">
        <Card title="Who has this client" tone="violet">
          <Facts
            items={[
              [
                "Point of contact",
                post
                  ? c.design.designer
                    ? "Designer " + c.design.designer
                    : "Designer not allotted"
                  : window.People.owner(c),
              ],
              ["Sales person", window.People.owner(c)],
              ["Designer", c.design.designer],
              ["Last spoke to client", last ? day(last) : ""],
              [
                "Next follow-up",
                c.nextFollowUp ? window.Kit.when(c.nextFollowUp) : "",
              ],
              ["Calls logged", String(c.contacts.length)],
            ]}
          />
          {c.contacts.slice(0, 3).map((e, i) => (
            <p className="hint" key={i}>
              {window.Kit.dayTime(e.at)} · {e.type} ·{" "}
              {window.Kit.outcome(e.outcome)}
              {e.note && " · " + e.note}
            </p>
          ))}
        </Card>
        <Card title="Design" tone="blue">
          <Facts
            items={[
              ["Proposals", String(c.design.proposals.length)],
              ["Revisions", String(c.design.revisions.length)],
              [
                "Latest proposal",
                p ? "V" + p.v + " · " + money(p.amount) + " · " + p.status : "",
              ],
              ["Client approved", c.approvedAt ? day(c.approvedAt) : ""],
              ["Design theme", b.theme],
              ["Kitchen type", b.kitchenType.join(", ")],
              ["Room / area", b.room],
              ["Notes", b.notes],
            ]}
          />
          {[
            ["Signed quotation", "quotation"],
            ["Signed drawing", "drawing"],
            ["Drawings and video files", "drf"],
            ["Layout", "layout"],
          ].map(([label, key]) => (
            <div className="line rule" key={key}>
              <span>{label}</span>
              {c.docs[key] ? (
                <FileLink owner={c.id} name={c.docs[key]} />
              ) : (
                <span>Not uploaded</span>
              )}
            </div>
          ))}
        </Card>
        <Card title="Dates and money" tone="green">
          {post && (
            <div className="soft">
              <b>Post-design steps</b>
              <div className="g2">
                <FlowSteps c={c} ctx={ctx} />
              </div>
              <p>
                6 · 80% in · Accounts go-ahead:{" "}
                {L.productionRow(c).due
                  ? money(L.productionRow(c).due) + " to collect"
                  : "Received"}
              </p>
              <p>
                7 · Shoot to factory:{" "}
                {c.factoryAt
                  ? "In factory since " + short(c.factoryAt)
                  : "After 5 and 6"}
              </p>
              {c.factoryAt && <p>{mailLine(c)}</p>}
            </div>
          )}
          <Facts
            items={[
              ["Drawing signoff", d ? day(d.signoff) : ""],
              ["PDI", d ? day(d.pdi) : ""],
              ["Dispatch", d ? day(d.dispatch) : ""],
              ["Handover", d ? day(d.handover) : ""],
              ["Order value", t.total ? money(t.total) : ""],
              [
                "Paid so far",
                t.total
                  ? money(L.collected(c)) +
                    " · " +
                    Math.round((L.collected(c) / t.total) * 100) +
                    "%"
                  : "",
              ],
            ]}
          />
          {L.ledger(c).map((s) => (
            <div className="line rule" key={s.name}>
              <span>
                <b>{s.name}</b> · {s.percent}% · {money(s.amount)}
              </span>
              <Pill tone={s.due === 0 && s.amount ? "green" : "grey"}>
                {s.due === 0 && s.amount
                  ? "Paid"
                  : s.paid
                    ? money(s.due) + " left"
                    : "Not paid"}
              </Pill>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
