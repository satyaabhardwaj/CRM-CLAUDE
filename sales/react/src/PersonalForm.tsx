import { useState } from "react";
import {
  binClient,
  nextBillingId,
  related,
  rules,
  type Billing,
  type FormProps,
  type SalesClient,
} from "./model";
import { Attachment, Button, Check, Field, now, Select } from "./ui";
export function BillingPicker({ c, ctx }: FormProps) {
  const [adding, setAdding] = useState(false),
    [name, setName] = useState("");
  return (
    <div className="flexrow">
      <Select
        label="Billing name"
        value={c.billingPick}
        options={c.billing.map((b) => [b.id, b.name + " · " + b.id])}
        placeholder={false}
        onChange={(v) =>
          ctx.update(() => {
            c.billingPick = v;
          })
        }
      />
      {adding ? (
        <>
          <Field
            label="New billing name"
            value={name}
            immediate
            onCommit={setName}
          />
          <Button
            disabled={!name.trim()}
            onClick={() => {
              ctx.update(() => {
                const id = nextBillingId(c);
                c.billing.push({ id, name: name.trim() });
                c.billingPick = id;
              });
              setAdding(false);
              setName("");
            }}
          >
            Add billing name
          </Button>
        </>
      ) : (
        <Button tone="small dash" onClick={() => setAdding(true)}>
          Add billing name
        </Button>
      )}
    </div>
  );
}
function Email({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button tone="small" onClick={() => setOpen(!open)}>
        {value ? "Email ✓" : "Email"}
      </Button>
      {open && (
        <Field label="Email" type="email" value={value} onCommit={onChange} />
      )}
    </>
  );
}
export function orderLabel(c: SalesClient, name: string) {
  c.orderName = name;
  c.name =
    name.toLowerCase() === String(c.person).toLowerCase()
      ? c.person!
      : c.person + " · " + name;
}
export function additionalOrder(
  c: SalesClient,
  name: string,
  phone: string,
  id: string,
  layout: string,
) {
  const copy = structuredClone(c);
  copy.id = id;
  if (phone.trim()) copy.phone = phone.trim();
  if (!c.oneContact) copy.email = "";
  orderLabel(copy, name.trim());
  copy.stage = c.stage === "qualified" ? "qualified" : "design";
  copy.design = {
    brief: { kitchenType: [] },
    proposals: [],
    revisions: [],
    step: "drf",
    stepAt: now(),
  };
  copy.order = { products: [] };
  copy.payment = { plan: c.payment.plan, receipts: [] };
  copy.approvals = {
    plan: "Not sent",
    timeline: "Not sent",
    booking: "Not sent",
  };
  copy.timeline = { type: "Standard", productionDays: 45, custom: {} };
  copy.docs = layout ? { layout } : {};
  copy.news = [];
  copy.nextFollowUp = "";
  copy.retry = null;
  // Signature and gates belong to the original order, never to a fresh one.
  for (const key of [
    "measurement",
    "timelineChanges",
    "approvalNotes",
    "submittedAt",
    "bookedAt",
    "approvedAt",
    "ocfAt",
    "ocfAsked",
    "recordingText",
    "binned",
    "binnedCall",
    "ocfSign",
    "ocfSignTried",
    "ocfSignProblem",
    "gates",
    "factoryAt",
    "factoryMail",
  ])
    delete copy[key];
  return rules().ensure(copy);
}
function Orders({ c, ctx }: FormProps) {
  const all = related(c, ctx),
    [confirm, setConfirm] = useState(false),
    [adding, setAdding] = useState(false),
    [draft, setDraft] = useState({
      id: "c" + crypto.randomUUID(),
      name: "",
      phone: "",
      layout: "",
    });
  const single = () => {
    c.multi = false;
    c.name = c.person || c.name;
    delete c.orderName;
    delete c.groupId;
    delete c.oneContact;
  };
  if (c.segment !== "Retail" && !c.multi) return null;
  return (
    <div className="stack">
      <Check
        label="Multiple orders"
        checked={c.multi}
        onChange={(on) => {
          if (!on && all.length > 1) {
            setConfirm(true);
            return;
          }
          ctx.update(() => {
            if (!on) single();
            else {
              c.multi = true;
              c.groupId = c.id;
              c.person = c.name;
              orderLabel(c, c.name);
            }
          });
        }}
      />
      {c.multi && (
        <>
          <Check
            label="One main contact for all"
            checked={c.oneContact}
            onChange={(on) =>
              ctx.update(() =>
                all.forEach((o) => {
                  o.oneContact = on;
                  if (on) o.phone = c.phone;
                }),
              )
            }
          />
          {confirm && (
            <div className="soft">
              <p>
                This keeps "{c.orderName}" as the only order and moves the other{" "}
                {all.length - 1} to the Bin. They can be restored.
              </p>
              <Button
                tone="warn"
                onClick={() => {
                  ctx.update(() => {
                    all.forEach((o) => {
                      if (o.id !== c.id) binClient(o);
                    });
                    single();
                  });
                  setConfirm(false);
                }}
              >
                Keep only this order
              </Button>
              <Button onClick={() => setConfirm(false)}>Cancel</Button>
            </div>
          )}
          {all.map((o) => (
            <div className="stack" key={o.id}>
              <Field
                label="Order name"
                value={o.orderName}
                onCommit={(v) =>
                  ctx.update(() => orderLabel(o, v.trim() || "Order"))
                }
              />
              {!c.oneContact && (
                <>
                  <Field
                    label={"Phone of " + o.orderName}
                    value={o.phone}
                    type="tel"
                    onCommit={(v) =>
                      ctx.update(() => {
                        o.phone = v.trim();
                      })
                    }
                  />
                  <Email
                    value={o.email}
                    onChange={(v) =>
                      ctx.update(() => {
                        o.email = v.trim();
                      })
                    }
                  />
                </>
              )}
              <Attachment
                label="Layout"
                owner={o.id}
                name={o.docs.layout}
                onUploaded={(name) =>
                  ctx.update(() => {
                    o.docs.layout = name;
                  })
                }
              />
              {all.length > 1 && (
                <Button
                  tone="small"
                  onClick={() => {
                    ctx.update(() => binClient(o));
                    if (o.id === c.id) {
                      const other = all.find((x) => x.id !== o.id)!;
                      if (other.stage === "post") ctx.goTo("tracker", other);
                      else ctx.open(other);
                    }
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {!adding ? (
            <Button tone="small dash" onClick={() => setAdding(true)}>
              Add order
            </Button>
          ) : (
            <div className="stack">
              <Field
                label="New order name"
                value={draft.name}
                immediate
                onCommit={(name) => setDraft((x) => ({ ...x, name }))}
              />
              {!c.oneContact && (
                <Field
                  label="New order phone"
                  value={draft.phone}
                  immediate
                  onCommit={(phone) => setDraft((x) => ({ ...x, phone }))}
                />
              )}
              <Attachment
                label="New order layout"
                owner={draft.id}
                name={draft.layout}
                onUploaded={(layout) => setDraft((x) => ({ ...x, layout }))}
              />
              <Button
                tone="dark"
                disabled={!draft.name.trim()}
                onClick={() => {
                  ctx.update(() =>
                    ctx.add(
                      additionalOrder(
                        c,
                        draft.name,
                        draft.phone,
                        draft.id,
                        draft.layout,
                      ),
                    ),
                  );
                  setDraft({
                    id: "c" + crypto.randomUUID(),
                    name: "",
                    phone: "",
                    layout: "",
                  });
                  setAdding(false);
                }}
              >
                Add order
              </Button>
              <Button onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function BillingDetails({ c, ctx, b }: FormProps & { b: Billing }) {
  const [open, setOpen] = useState(false);
  const text = (key: Exclude<keyof Billing, "sameAsSite">, label: string) => (
    <Field
      label={label}
      value={b[key]}
      onCommit={(v) =>
        ctx.update(() => {
          b[key] = v;
        })
      }
    />
  );
  return (
    <div className={"bill" + (open ? " open" : "")}>
      <div className="line">
        <button
          type="button"
          className="bill-h"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <b>{b.name}</b>
          <span className="sub">
            {" "}
            · {b.id}
            {b.gst && " · GST " + b.gst}
            {b.sameAsSite
              ? " · site address"
              : b.address
                ? " · address added"
                : " · details not filled"}
          </span>
        </button>
        {c.billing.length > 1 ? (
          <Button
            tone="small"
            onClick={() =>
              ctx.update(() => {
                c.billing.splice(c.billing.indexOf(b), 1);
                if (c.billingPick === b.id) c.billingPick = c.billing[0].id;
              })
            }
          >
            Remove
          </Button>
        ) : (
          <span>Main</span>
        )}
      </div>
      {open && (
        <div className="g2">
          {text("name", "Billing name")}
          {text("gst", "GST number")}
          {text("pan", "PAN")}
          {text("phone", "Phone")}
          {text("email", "Email for the invoice")}
          {text("state", "State")}
          <Check
            label="Billing address is the same as the site address"
            checked={b.sameAsSite}
            onChange={(v) =>
              ctx.update(() => {
                b.sameAsSite = v;
              })
            }
          />
          {!b.sameAsSite && (
            <>
              {text("address", "Billing address")}
              {text("pin", "PIN code")}
            </>
          )}
        </div>
      )}
    </div>
  );
}
export function PersonalForm({ c, ctx }: FormProps) {
  const [personOpen, setPersonOpen] = useState(false),
    [person, setPerson] = useState({ name: "", relation: "", phone: "" }),
    [bill, setBill] = useState("");
  const text = (
    key: "siteAddress" | "city" | "siteState" | "siteContact",
    label: string,
  ) => (
    <Field
      label={label}
      value={c[key] === "City not set" ? "" : c[key]}
      onCommit={(v) =>
        ctx.update(() => {
          c[key] = v;
        })
      }
    />
  );
  return (
    <section className="card card-b">
      <div className="cols">
        <div className="stack">
          <b className="cap2">Names and phones</b>
          {(!c.multi || c.oneContact) && (
            <>
              <Field
                label="Main contact"
                value={c.person || c.name}
                onCommit={(v) => {
                  if (!v.trim()) return;
                  ctx.update(() => {
                    if (!c.multi) c.name = v.trim();
                    else
                      related(c, ctx).forEach((o) => {
                        const own =
                          o.orderName?.toLowerCase() ===
                          o.person?.toLowerCase();
                        o.person = v.trim();
                        orderLabel(o, own ? v.trim() : o.orderName || "Order");
                      });
                  });
                }}
              />
              <Field
                label="Phone"
                value={c.phone}
                type="tel"
                onCommit={(v) =>
                  ctx.update(() =>
                    related(c, ctx).forEach((o) => {
                      o.phone = v.trim();
                    }),
                  )
                }
              />
              <Email
                value={c.email}
                onChange={(v) =>
                  ctx.update(() =>
                    related(c, ctx).forEach((o) => {
                      o.email = v.trim();
                    }),
                  )
                }
              />
            </>
          )}
          {(c.people || []).map((p, i) => (
            <div className="stack" key={i}>
              <div className="line">
                <span>
                  <b>{p.name}</b> · {p.relation} · {p.phone}
                </span>
                <Button
                  tone="small"
                  onClick={() =>
                    ctx.update(() => {
                      c.people!.splice(i, 1);
                    })
                  }
                >
                  Remove
                </Button>
              </div>
              <Email
                value={p.email}
                onChange={(v) =>
                  ctx.update(() => {
                    p.email = v.trim();
                  })
                }
              />
            </div>
          ))}
          {personOpen ? (
            <>
              <Field
                label="Name"
                value={person.name}
                immediate
                onCommit={(name) => setPerson((x) => ({ ...x, name }))}
              />
              <Select
                label="Relation"
                value={person.relation}
                options={[
                  "Self",
                  "Spouse",
                  "Father",
                  "Mother",
                  "Son",
                  "Daughter",
                  "Architect",
                  "Site in-charge",
                  "Other",
                ]}
                onChange={(relation) => setPerson((x) => ({ ...x, relation }))}
              />
              <Field
                label="New person phone"
                value={person.phone}
                type="tel"
                immediate
                onCommit={(phone) => setPerson((x) => ({ ...x, phone }))}
              />
              <Button
                disabled={!person.name.trim()}
                onClick={() => {
                  ctx.update(() =>
                    (c.people ||= []).push({
                      ...person,
                      name: person.name.trim(),
                      phone: person.phone.trim(),
                    }),
                  );
                  setPerson({ name: "", relation: "", phone: "" });
                  setPersonOpen(false);
                }}
              >
                Add person
              </Button>
              <Button onClick={() => setPersonOpen(false)}>Cancel</Button>
            </>
          ) : (
            <Button tone="small dash" onClick={() => setPersonOpen(true)}>
              Add person
            </Button>
          )}
          <Orders c={c} ctx={ctx} />
        </div>
        <div className="stack">
          <b className="cap2">Addresses</b>
          {text("siteAddress", "Site address")}
          <div className="g3">
            <Field
              label="PIN code"
              value={c.sitePin}
              onCommit={(v) => {
                const pin = v.replace(/[^0-9]/g, "").slice(0, 6);
                ctx.update(() => {
                  c.sitePin = pin;
                  if (window.Pin.ok(pin) && window.Pin.state(pin))
                    c.siteState = window.Pin.state(pin);
                });
                void window.Pin.lookup(pin).then((found) => {
                  if (found && c.sitePin === pin)
                    ctx.update(() => {
                      if (found.city) c.city = found.city;
                      if (found.state) c.siteState = found.state;
                    });
                });
              }}
            />
            {text("city", "City")}
            {text("siteState", "State")}
          </div>
          {c.sitePin && !window.Pin.ok(c.sitePin) && (
            <p className="msg">A PIN code has 6 digits.</p>
          )}
          {text("siteContact", "Site contact on the day")}
        </div>
        <div className="stack">
          <b className="cap2">Billing names</b>
          {c.billing.map((b) => (
            <BillingDetails key={b.id} c={c} ctx={ctx} b={b} />
          ))}
          <Field
            label="Another billing name"
            value={bill}
            immediate
            onCommit={setBill}
          />
          <Button
            tone="small dash"
            disabled={!bill.trim()}
            onClick={() => {
              ctx.update(() =>
                c.billing.push({ id: nextBillingId(c), name: bill.trim() }),
              );
              setBill("");
            }}
          >
            Add billing name
          </Button>
        </div>
      </div>
    </section>
  );
}
