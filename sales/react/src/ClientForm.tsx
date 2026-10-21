import { useState } from "react";
import { related, rules, type FormProps } from "./model";
import { Button, Field, money, Pill, Select } from "./ui";
import { QualifiedForm } from "./QualifiedForm";
import { DesignForm } from "./DesignForm";
import { OrderForms } from "./OrderForms";
import { PersonalForm } from "./PersonalForm";
import { handOver } from "./commands";
import { clientPdf } from "./reports.js";
import { WhatsApp } from "./WhatsApp";
import { TrackerDetails } from "./Tracker";
export function ClientForm({ c, ctx }: FormProps) {
  const [edit, setEdit] = useState(false),
    L = rules(),
    viewing = ctx.viewing,
    orders = related(c, ctx),
    billing = c.billing.find((b) => b.id === c.billingPick) || c.billing[0],
    at = L.STAGES.findIndex((s) => s[0] === c.stage);
  const text = (
    key: "name" | "phone" | "city" | "product" | "budget",
    label: string,
  ) => (
    <Field
      label={label}
      value={c[key]}
      onCommit={(v) =>
        ctx.update(() => {
          c[key] = v;
        })
      }
    />
  );
  if (viewing === "tracker") return <TrackerDetails c={c} ctx={ctx} />;
  return (
    <>
      <div className="sheet-h">
        <div className="stack">
          <div className="flexrow">
            <h2>{c.name}</h2>
            {c.stage === "qualified" ? (
              <Pill tone={L.clock(c)[1]}>{L.clock(c)[0]}</Pill>
            ) : (
              <Pill>
                {c.stage === "design"
                  ? c.design.step
                  : L.bookingLeft(c) === 0
                    ? "Booking share collected"
                    : !L.tokenIn(c)
                      ? "Token not in"
                      : "Collecting"}
              </Pill>
            )}
          </div>
          {c.multi && orders.length > 1 && (
            <div
              className="ordertabs"
              role="tablist"
              aria-label="Orders of this client"
            >
              {orders.map((o) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={o.id === c.id}
                  className={o.id === c.id ? "on" : ""}
                  key={o.id}
                  onClick={() =>
                    o.stage === "post" ? ctx.goTo("tracker", o) : ctx.open(o)
                  }
                >
                  <b>{o.orderName}</b>
                  <small>{o.stage}</small>
                </button>
              ))}
            </div>
          )}
          <div className="sub">
            Project {c.pid} · Customer {c.cid} ·{" "}
            {c.segment || "Segment not set"} · {c.source}
            {c.psm && ", passed by " + c.psm} · Trust{" "}
            {c.trust ? c.trust + "/10" : "not set"}
          </div>
          <div className="sub">
            <b>Billing: {billing?.name}</b> · {billing?.id}
            {billing?.gst && " · GST " + billing.gst}
            {billing?.pan && " · PAN " + billing.pan}
            {(billing?.sameAsSite ? c.siteAddress : billing?.address) &&
              " · " + (billing?.sameAsSite ? c.siteAddress : billing?.address)}
            {c.billing.length > 1 &&
              " · +" + (c.billing.length - 1) + " more billing name(s)"}
          </div>
          <div className="flexrow">
            <Button tone="small line" onClick={() => setEdit(!edit)}>
              {edit ? "Done editing" : "Edit anything"}
            </Button>
            <Button tone="small line" onClick={() => clientPdf(c)}>
              Download PDF
            </Button>
            <WhatsApp c={c} ctx={ctx} />
          </div>
          {edit && (
            <div className="g4">
              {text("name", "Customer name")}
              {text("phone", "Phone")}
              {text("city", "City")}
              {text("product", "Product")}
              <Select
                label="Source"
                value={c.source}
                options={[
                  "Social media",
                  "Walk-in",
                  "Architect reference",
                  "Referral",
                ]}
                placeholder={false}
                onChange={(v) =>
                  ctx.update(() => {
                    c.source = v;
                  })
                }
              />
              {text("budget", "Budget")}
              <Select
                label="Segment"
                value={c.segment}
                options={["Retail", "Pro-Retail", "Projects"]}
                onChange={(v) =>
                  ctx.update(() => {
                    c.segment = v;
                  })
                }
              />
              <Select
                label="Trust"
                value={c.trust}
                options={Array.from({ length: 10 }, (_, i) => [
                  String(10 - i),
                  10 - i + " / 10",
                ])}
                onChange={(v) =>
                  ctx.update(() => {
                    c.trust = v;
                  })
                }
              />
            </div>
          )}
        </div>
        <div className="stack">
          <Button tone="small" onClick={ctx.close}>
            Close
          </Button>
          <div className="steps">
            {L.STAGES.map(([id, label], i) =>
              i > (c.stage === "post" ? 2 : at) ? (
                <span key={id}>{label}</span>
              ) : (
                <button
                  key={id}
                  type="button"
                  className={viewing === id ? "now" : "done"}
                  aria-pressed={viewing === id}
                  onClick={() => ctx.peek(id)}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
      <div className="sheet-b">
        {viewing === "qualified" ? (
          <>
            <QualifiedForm c={c} ctx={ctx} />
            <PersonalForm c={c} ctx={ctx} />
          </>
        ) : viewing === "design" ? (
          <DesignForm c={c} ctx={ctx} />
        ) : (
          <>
            {c.stage === "booked" && (
              <section className="card card-b">
                <div className="line">
                  <span>
                    <b>
                      Collected {money(L.collected(c))} of{" "}
                      {money(L.bookingDue(c))}
                    </b>{" "}
                    ·{" "}
                    {L.bookingLeft(c)
                      ? money(L.bookingLeft(c)) +
                        " left before this client moves on"
                      : "the booking share is in"}
                  </span>
                  <Button
                    tone="dark"
                    disabled={L.bookingLeft(c) !== 0}
                    onClick={() => ctx.update(() => handOver(c))}
                  >
                    Move to post-design
                  </Button>
                </div>
              </section>
            )}
            <OrderForms c={c} ctx={ctx} />
          </>
        )}
      </div>
    </>
  );
}
