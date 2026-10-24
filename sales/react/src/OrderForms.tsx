import { useState } from "react";
import { rules, type Dates, type FormProps } from "./model";
import {
  Attachment,
  Button,
  Card,
  day,
  Field,
  money,
  now,
  Pill,
  Select,
  Voice,
} from "./ui";
import { ClientArchitect } from "./ArchitectPicker";
import { BillingPicker } from "./PersonalForm";
import { ProofUploads } from "./DesignForm";
import { ContactForm } from "./ContactForm";
import {
  askSpecialMeasurement,
  decideSpecialMeasurement,
  fillFromEstimate,
  news,
  requestPayment,
  submitBooking,
} from "./commands";
import { OcfForm } from "./OcfForm";
export function OrderForm({ c, ctx }: FormProps) {
  const [working, setWorking] = useState(false),
    o = c.order,
    t = rules().totals(c),
    bankOnly = window.Kit.bankOnly();
  // Type the %; the rupee amount it comes to shows right beside it (23 Oct 2026).
  const pct = (
    key: "bankPct" | "faPct",
    label: string,
    fallback: number | null,
    amount: number,
  ) => (
    <div className="pct-row">
      <Field
        label={label}
        value={o[key]}
        placeholder={fallback == null ? "%" : fallback + "%"}
        onCommit={(v) =>
          ctx.update(() => {
            const n = v.replace(/[^0-9.]/g, "");
            o[key] = n === "" ? null : Math.min(100, Number(n) || 0);
            if (key === "bankPct") delete o.md;
            else delete o.freight;
          })
        }
      />
      <b className="num pct-amount">= {money(amount)}</b>
    </div>
  );
  const rupees = (key: "installation" | "transport", label: string) => (
    <Field
      label={label}
      value={o[key] || ""}
      placeholder="₹"
      onCommit={(v) =>
        ctx.update(() => {
          o[key] = Number(v.replace(/[^0-9.]/g, "")) || 0;
        })
      }
    />
  );
  const plan = [...c.design.proposals].reverse().find((p) => p.plan)?.plan;
  const amounts: [string, number][] = [
    ["Offer basic value", t.base],
    ["Less management discount, no GST", t.md],
    ["Bank amount before GST", t.bankBase],
    ["GST 18% on the bank amount", t.tax],
    ["In bank, with GST", t.bank],
    ["Free accessories", t.freight],
    ...(c.architectInvolved
      ? ([
          ["Less architect success fees", t.success],
          ["Offer basic value after success fees", t.afterSuccess],
        ] as [string, number][])
      : []),
    ["Net inflow to the company", t.net],
  ];
  return (
    <Card title="1 · Order" tone="blue">
      {(o.products.length ? o.products : [null]).map((p, i) => (
        <div className="line" key={i}>
          <span>{p?.product || "Kitchen"}</span>
          <Field
            label={i ? (p?.product || "Kitchen") + " value" : "Kitchen value"}
            value={p?.value || 0}
            onCommit={(v) =>
              ctx.update(() => {
                const value = Number(v.replace(/[^0-9.-]/g, "")) || 0;
                if (p) {
                  p.value = value;
                  p.product ||= "Kitchen";
                } else o.products.push({ product: "Kitchen", value });
              })
            }
          />
        </div>
      ))}
      <div className="g2">
        {rupees("installation", "Installation (₹)")}
        {rupees("transport", "Freight (₹)")}
      </div>
      {plan && (
        <div className="line">
          <span className="sub">
            From the designer&rsquo;s estimate: kitchen {money(plan.kitchen)} ·
            installation {money(plan.installation)} · freight{" "}
            {money(plan.transport)}
            {plan.visits != null &&
              " · " +
                plan.visits +
                " site visits × " +
                money(plan.visitRate || 0)}
          </span>
          <Button
            tone="small"
            onClick={() => ctx.update(() => fillFromEstimate(c, plan))}
          >
            Fill from estimate
          </Button>
        </div>
      )}
      {!bankOnly && (
        <>
          {pct("bankPct", "Bank %", t.bankPct, t.bankBase)}
          {pct(
            "faPct",
            "Free accessories %",
            o.faPct == null && t.md && o.freight
              ? Math.round((o.freight / t.md) * 10000) / 100
              : null,
            t.freight,
          )}
          <Select
            label="Order type"
            value={o.type || "Retail"}
            options={["Retail", "Project"]}
            placeholder={false}
            onChange={(v) =>
              ctx.update(() => {
                o.type = v;
              })
            }
          />
        </>
      )}
      <div className="line">
        <span>In bank, with GST</span>
        <b className="num">{money(t.bank)}</b>
      </div>
      <div className="line rule">
        <b>Total payable by client</b>
        <b className="num" style={{ fontSize: 22 }}>
          {money(t.total)}
        </b>
      </div>
      {!bankOnly && (
        <>
          <Button tone="small" onClick={() => setWorking(!working)}>
            {working ? "Hide the working" : "See how this is worked out"}
          </Button>
          {working && (
            <div className="soft">
              {amounts.map(([label, value]) => (
                <div className="line" key={label}>
                  <span>{label}</span>
                  <span className="num">{money(value)}</span>
                </div>
              ))}
            </div>
          )}
          <ClientArchitect c={c} ctx={ctx} />
          {c.architectInvolved && t.success > 0 && (
            <div className="line">
              <span>
                Architect success fees · {o.archPct}% · not shown to the client
              </span>
              <span>{money(t.success)}</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
const dateFields: [keyof Dates, string][] = [
  ["signoff", "Drawing signoff"],
  ["pdi", "PDI"],
  ["dispatch", "Dispatch"],
  ["handover", "Handover"],
];
export function TimelineForm({ c, ctx }: FormProps) {
  const t = c.timeline,
    d = rules().dates(c),
    changes = c.timelineChanges || [],
    was = changes.at(-1);
  const start = c.ocfAt || c.bookedAt;
  const add = (iso: string, n: number) => {
    const date = new Date(iso);
    date.setDate(date.getDate() + n);
    return window.Kit.ymd(date);
  };
  const dispatch = start ? add(start, Number(t.productionDays) || 45) : "";
  const original = start
    ? {
        signoff: window.Kit.ymd(new Date(start)),
        dispatch,
        pdi: add(dispatch, -21),
        handover: add(dispatch, 30),
      }
    : changes[0]?.before || d;
  const differs =
    d && original && dateFields.some(([k]) => original[k] !== d[k]);
  const due = (key: string) => {
    const name = (
      { signoff: "Production", pdi: "PDI", handover: "EHOD" } as Record<
        string,
        string
      >
    )[key];
    const s = rules()
      .shares(c)
      .find((s) => s.name === name);
    return s ? s.percent + "% due" : "";
  };
  return (
    <Card title="2 · Timeline" tone="violet">
      <div className="g3">
        <Select
          label="Timeline"
          value={t.type}
          options={["Standard", "Express", "Custom"]}
          placeholder={false}
          onChange={(v) =>
            ctx.update(() => {
              t.type = v;
            })
          }
        />
        <Field
          label="Pooja / handover"
          type="date"
          value={t.handover}
          onCommit={(v) =>
            ctx.update(() => {
              t.handover = v;
            })
          }
        />
        <Select
          label="Production days"
          value={t.productionDays}
          options={["30", "35", "40", "45", "50", "55", "60"]}
          placeholder={false}
          onChange={(v) =>
            ctx.update(() => {
              t.productionDays = v;
            })
          }
        />
      </div>
      {d && (
        <>
          {t.type === "Custom" ? (
            <div className="g3">
              {dateFields.slice(0, 3).map(([key, label]) => (
                <Field
                  key={key}
                  label={label + (due(key) ? " · " + due(key) : "")}
                  type="date"
                  value={d[key]}
                  onCommit={(v) =>
                    ctx.update(() => {
                      t.custom[key] = v;
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="tl">
              {dateFields.map(([key, label]) => (
                <div key={key}>
                  <i />
                  <span className="sub">{label}</span>
                  <b>{day(d[key])}</b>
                  <small>{due(key)}</small>
                </div>
              ))}
            </div>
          )}
          <div className="g2">
            {[
              ["Original timeline", original],
              ["Overwritten timeline", was?.after || (differs ? d : null)],
            ].map(([title, values]) => (
              <div className="soft" key={String(title)}>
                <b>{String(title)}</b>
                {title === "Original timeline" && c.bookedAt && (
                  <span className="sub">
                    {" "}
                    · booked {day(c.bookedAt)}
                    {c.ocfAt && " · drawing signoff on the OCF date"}
                  </span>
                )}
                {title === "Overwritten timeline" && was && (
                  <span className="sub"> · by Design on {day(was.at)}</span>
                )}
                {values ? (
                  dateFields.map(([key, label]) => (
                    <div className="line" key={key}>
                      <span>{label}</span>
                      <span>{day((values as Dates)[key])}</span>
                    </div>
                  ))
                ) : (
                  <span>Not overwritten. The original timeline stands.</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
export function PaymentForm({ c, ctx }: FormProps) {
  const blank = () => ({
    amount: "",
    date: window.Kit.today(),
    mode: "",
    proof: "",
    kind: "bank",
    ref: "",
    remarks: "",
  });
  const [error, setError] = useState(""),
    [draft, setDraft] = useState(blank);
  const p = c.payment,
    L = rules();
  return (
    <Card title="3 · Payment" tone="green">
      <Select
        label="Payment plan"
        value={p.plan}
        options={Object.entries(L.PLANS).map(([id, p]) => [id, p.label])}
        placeholder={false}
        onChange={(v) =>
          ctx.update(() => {
            p.plan = v;
          })
        }
      />
      <div className="sub">
        {L.shares(c)
          .map((s) => s.name + " " + s.percent + "% " + money(s.amount))
          .join(" · ")}
      </div>
      <div className="pay-sum">
        {[
          ["Booking amount", L.bookingDue(c)],
          ["Received · by Accounts", L.collected(c)],
          ["Left", L.bookingLeft(c)],
        ].map(([label, amount]) => (
          <div key={label}>
            <span>{label}</span>
            <b className="num">{money(amount)}</b>
          </div>
        ))}
      </div>
      <b>What the client has promised</b>
      <div className="g3">
        {!window.Kit.bankOnly() && (
          <>
            <Field
              label="Token amount (₹)"
              value={p.tokenPlan}
              onCommit={(v) =>
                ctx.update(() => {
                  p.tokenPlan = Number(v.replace(/[^0-9.-]/g, "")) || 0;
                })
              }
            />
            <Field
              label="Token date"
              type="date"
              value={p.tokenBy}
              onCommit={(v) =>
                ctx.update(() => {
                  p.tokenBy = v;
                })
              }
            />
          </>
        )}
        <Field
          label={
            window.Kit.bankOnly()
              ? "Booking amount by"
              : "Rest of booking amount by"
          }
          type="date"
          value={p.expectedBy}
          onCommit={(v) =>
            ctx.update(() => {
              p.expectedBy = v;
            })
          }
        />
      </div>
      <BillingPicker c={c} ctx={ctx} />
      <b>Payments so far ({p.receipts.length})</b>
      {p.receipts.length ? (
        <div className="pay-table">
          <div className="pay-row head">
            <span>Date</span>
            <span>Amount</span>
            <span>Type</span>
            <span>How paid</span>
            <span>Remarks</span>
            <span>Status</span>
          </div>
          {p.receipts.map((r, i) => (
            <div className="pay-row" key={i}>
              <span>{day(r.date)}</span>
              <b className="num">{money(r.amount)}</b>
              <span>{r.kind === "md" ? "Management" : "Bank"}</span>
              <span>
                {r.mode || "-"}
                {r.ref ? " · " + r.ref : ""}
              </span>
              <span className="sub">
                {r.remarks || "-"}
                {r.status === "Rejected" && (
                  <span className="msg">
                    {" "}
                    {r.reason || "Rejected"}
                    {r.notes && " · " + r.notes}
                  </span>
                )}
              </span>
              <span className="flexrow">
                <Pill
                  tone={
                    r.status === "Confirmed"
                      ? "green"
                      : r.status === "Rejected"
                        ? "red"
                        : "blue"
                  }
                >
                  {r.status === "Requested" ? "With Accounts" : r.status}
                </Pill>
                {r.status !== "Confirmed" && (
                  <Button
                    tone="small"
                    onClick={() =>
                      ctx.update(() => {
                        p.receipts.splice(i, 1);
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="sub">No payments yet.</p>
      )}
      {/* Add a payment: always here, as many times as needed. Accounts confirms each one. */}
      <div className="soft">
        <b>Add a payment</b>
        <div className="g3">
          <Field
            label="Amount (₹)"
            value={draft.amount}
            immediate
            onCommit={(amount) => setDraft((x) => ({ ...x, amount }))}
          />
          <Field
            label="Date"
            type="date"
            value={draft.date}
            immediate
            onCommit={(date) => setDraft((x) => ({ ...x, date }))}
          />
          <Select
            label="How it was paid"
            value={draft.mode}
            options={[
              "Bank transfer",
              "UPI",
              "Cheque",
              "Cash",
              "Pickup needed",
            ]}
            onChange={(mode) => setDraft((x) => ({ ...x, mode }))}
          />
          {!window.Kit.bankOnly() && (
            <Select
              label="Type of payment"
              value={draft.kind}
              options={[
                ["bank", "Bank"],
                ["md", "Management"],
              ]}
              placeholder={false}
              onChange={(kind) => setDraft((x) => ({ ...x, kind }))}
            />
          )}
          <Field
            label="Reference no."
            value={draft.ref}
            immediate
            onCommit={(ref) => setDraft((x) => ({ ...x, ref }))}
          />
          <Field
            label="Remarks"
            value={draft.remarks}
            immediate
            onCommit={(remarks) => setDraft((x) => ({ ...x, remarks }))}
          />
        </div>
        <Attachment
          owner={c.id}
          name={draft.proof}
          label="Proof from the client"
          onUploaded={(proof) => setDraft((x) => ({ ...x, proof }))}
        />
        {error && (
          <p role="alert" className="msg">
            {error}
          </p>
        )}
        <Button
          tone="dark"
          onClick={() => {
            const amount = Number(draft.amount.replace(/,/g, ""));
            if (!Number.isFinite(amount) || amount <= 0) {
              setError("Enter a positive amount first.");
              return;
            }
            setError("");
            ctx.update(() => requestPayment(c, { ...draft, amount }));
            setDraft(blank());
          }}
        >
          Send to Accounts
        </Button>
      </div>
    </Card>
  );
}
export function ApprovalForm({ c, ctx }: FormProps) {
  const L = rules(),
    token = L.tokenIn(c),
    asked = c.payment.receipts.some((r) => r.status === "Requested"),
    refused =
      !token &&
      !asked &&
      c.payment.receipts.some((r) => r.status === "Rejected"),
    rejected = c.approvals.booking === "Rejected",
    ready = L.totals(c).total > 0 && !!c.timeline.handover;
  return (
    <Card title="5 · Approvals" tone="teal">
      <div className="line rule">
        <span>
          {window.Kit.bankOnly() ? "First payment" : "Token"} · Accounts
        </span>
        <Pill
          tone={token ? "green" : asked ? "blue" : refused ? "red" : "grey"}
        >
          {token
            ? "Approved"
            : asked
              ? "Pending"
              : refused
                ? "Rejected"
                : "Not requested"}
        </Pill>
      </div>
      <div className="line rule">
        <span>
          Booking · Accounts
          {rejected && c.approvalNotes?.booking && (
            <p className="msg">
              {c.approvalNotes.booking.reason} · {c.approvalNotes.booking.notes}
            </p>
          )}
        </span>
        <Pill
          tone={
            rejected
              ? "red"
              : c.approvals.booking === "Approved"
                ? "green"
                : "blue"
          }
        >
          {c.approvals.booking}
        </Pill>
      </div>
      <div className="flexrow">
        <Button
          tone="dark"
          disabled={(!!c.submittedAt && !rejected) || !ready}
          onClick={() => ctx.update(() => submitBooking(c))}
        >
          {rejected
            ? "Send again"
            : c.submittedAt
              ? "Booking submitted"
              : "Submit booking"}
        </Button>
      </div>
      {!ready && (
        <p className="msg">
          Before you submit:{" "}
          {[
            !L.totals(c).total && "fill the order value",
            !c.timeline.handover && "set the handover date in Timeline",
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}
    </Card>
  );
}
// Special approvals (23 Oct 2026): a first site measurement before the token needs the AVP's (Tavneet's) yes.
// On approval the measurement request goes to Measurement by itself, with the date asked for and the site details.
// It is the only visit Sales sends; after the token the designer books every visit (24 Oct 2026).
export function SpecialForm({ c, ctx }: FormProps) {
  const [reason, setReason] = useState(""),
    [date, setDate] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const s = c.special?.siteMeasurement,
    me = window.People.list[0],
    approver = window.People.list.find((p) => p.role === "AVP"),
    canDecide = me?.role === "AVP",
    token = rules().tokenIn(c);
  const run = (fn: () => void) => {
    try {
      setError("");
      ctx.update(fn);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Card title="6 · Special approvals" tone="violet">
      <div className="line rule">
        <span>
          <b>First site measurement before the token</b>
          <p className="sub">
            Approved by {approver ? approver.name + " (AVP)" : "the AVP"}. Once
            approved, the request goes to Measurement.
          </p>
        </span>
        <Pill
          tone={
            !s
              ? "grey"
              : s.status === "Approved"
                ? "green"
                : s.status === "Rejected"
                  ? "red"
                  : "blue"
          }
        >
          {s ? s.status : token ? "Not needed" : "Not asked"}
        </Pill>
      </div>
      {s && (
        <div className="soft">
          <span>
            Asked {day(s.requestedAt)} · {s.reason}
            {s.date ? " · for " + day(s.date) : ""}
          </span>
          {s.decidedAt && (
            <span>
              {s.status} by {s.decidedBy} on {day(s.decidedAt)}
              {s.note ? " · " + s.note : ""}
            </span>
          )}
        </div>
      )}
      {!token && (!s || s.status === "Rejected") && !c.measurement && (
        <>
          <Field
            label="Why is the measurement needed before the token?"
            value={reason}
            immediate
            onCommit={setReason}
          />
          <Field
            label="Date for the measurement"
            type="date"
            value={date}
            immediate
            onCommit={setDate}
          />
          <Button
            tone="dark"
            onClick={() => run(() => askSpecialMeasurement(c, reason, date))}
          >
            Send to {approver ? approver.name : "AVP"} for approval
          </Button>
        </>
      )}
      {s?.status === "Pending" && canDecide && (
        <>
          <Field label="Note" value={note} immediate onCommit={setNote} />
          <div className="flexrow">
            <Button
              tone="dark"
              onClick={() =>
                run(() => decideSpecialMeasurement(c, true, me.name, note))
              }
            >
              Approve
            </Button>
            <Button
              tone="warn"
              onClick={() =>
                run(() => decideSpecialMeasurement(c, false, me.name, note))
              }
            >
              Reject
            </Button>
          </div>
        </>
      )}
      {s?.status === "Pending" && !canDecide && (
        <p className="sub">Waiting for {approver?.name || "the AVP"}.</p>
      )}
      {(!token || s || c.siteAsk) && <SiteDetails c={c} ctx={ctx} />}
      {token && !s && (
        <p className="sub">
          The token is in: the designer books the site measurement now.
        </p>
      )}
      {error && (
        <p role="alert" className="msg">
          {error}
        </p>
      )}
    </Card>
  );
}
export function OrderForms(props: FormProps) {
  const { c, ctx } = props,
    [tab, setTab] = useState("order"),
    L = rules();
  const tabs = [
    ["order", "Order", money(L.totals(c).total)],
    [
      "timeline",
      "Timeline",
      c.timeline.handover ? "Handover " + day(c.timeline.handover) : "Not set",
    ],
    [
      "payment",
      "Payment",
      money(L.collected(c)) + " of " + money(L.bookingDue(c)),
    ],
    [
      "proof",
      "Proof and documents",
      [c.docs.quotation, c.docs.drawing].filter(Boolean).length +
        " of 2 signed forms",
    ],
    [
      "approvals",
      "Approvals",
      Number(L.tokenIn(c)) +
        Number(c.approvals.booking === "Approved") +
        " of 2 settled",
    ],
    [
      "special",
      "Special approvals",
      c.special?.siteMeasurement
        ? "Site measurement · " + c.special.siteMeasurement.status
        : "None asked",
    ],
    ["ocf", "OCF", c.ocfAt ? "Made " + day(c.ocfAt) : "Last step"],
    [
      "contact",
      "Log a contact",
      L.lastSpoke(c) ? "Last spoke " + day(L.lastSpoke(c)!) : "Not spoken yet",
    ],
  ];
  return (
    <div className="cols2">
      <div className="steplist">
        {tabs.map(([id, title, sub], i) => (
          <button
            key={id}
            type="button"
            className={"step" + (tab === id ? " on" : "")}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <span className="n">{id === "contact" ? "+" : i + 1}</span>
            <span className="grow">
              <b>{title}</b>
              <small>{sub}</small>
            </span>
          </button>
        ))}
      </div>
      <div>
        {tab === "order" && <OrderForm {...props} />}
        {tab === "timeline" && <TimelineForm {...props} />}
        {tab === "payment" && <PaymentForm {...props} />}
        {tab === "proof" && (
          <Card title="4 · Proof and documents" tone="amber">
            <ProofUploads {...props} />
            <Field
              label="Recorded message, written down"
              value={c.recordingText}
              onCommit={(v) =>
                ctx.update(() => {
                  c.recordingText = v;
                })
              }
            />
            <Voice
              onText={(text) =>
                ctx.update(() => {
                  c.recordingText = (
                    (c.recordingText || "") +
                    " " +
                    text
                  ).trim();
                })
              }
            />
          </Card>
        )}
        {tab === "approvals" && <ApprovalForm {...props} />}
        {tab === "special" && <SpecialForm {...props} />}
        {tab === "ocf" && <OcfForm {...props} />}
        {tab === "contact" && <ContactForm {...props} />}
      </div>
    </div>
  );
}

// Site details Measurement needs (Manish, 24 Oct 2026): site address, client number, site supervisor and number.
// Sales or the designer fills them; when Measurement asks for what is missing, the ask shows here until it is filled.
const SITE_FIELDS = [
  ["siteAddress", "Site address"],
  ["clientPhone", "Client number"],
  ["supervisor", "Site supervisor"],
  ["supervisorPhone", "Site supervisor number"],
] as const;
export function SiteDetails({ c, ctx }: FormProps) {
  const value = (k: (typeof SITE_FIELDS)[number][0]) =>
    k === "siteAddress"
      ? c.siteAddress || ""
      : k === "clientPhone"
        ? c.site?.clientPhone || c.phone || ""
        : c.site?.[k] || "";
  const missing = SITE_FIELDS.filter(
    ([k]) => c.siteAsk?.missing.includes(k) && !value(k),
  );
  return (
    <div className="site-details">
      <b>Site details for Measurement</b>
      {missing.length > 0 && (
        <p className="msg">
          Measurement asked for{" "}
          {missing.map(([, label]) => label.toLowerCase()).join(", ")} on{" "}
          {day(c.siteAsk!.at)}.
        </p>
      )}
      <div className="g2">
        {SITE_FIELDS.map(([k, label]) => (
          <Field
            key={k}
            label={label}
            type={k.endsWith("Phone") ? "tel" : "text"}
            value={value(k)}
            onCommit={(v) =>
              ctx.update(() => {
                if (k === "siteAddress") c.siteAddress = v;
                else c.site = { ...c.site, [k]: v };
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
