import { useState } from "react";
import type { FormProps } from "./model";
import { acceptLead, disqualify } from "./commands";
import { Attachment, Button, Choice, Field, Select } from "./ui";
import { ClientArchitect } from "./ArchitectPicker";
import { ContactForm } from "./ContactForm";
export const themes = [
  "Modern PG1",
  "Modern PG2",
  "Classic PG1",
  "Classic PG2",
];
export const kitchenTypes = ["Chef", "Show", "Storage", "Laundry", "Utility"];
export function QualifiedForm({ c, ctx }: FormProps) {
  const [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const live = c.stage === "qualified",
    v = c.validation,
    invalid = !!v.valid && !/^yes/i.test(v.valid);
  const act = (fn: () => void, open = false) => {
    try {
      if (open && !c.spokeAt)
        throw Error(
          'Speak to the client first. Save a call with "Spoke to client".',
        );
      if (!open && !(invalid ? v.invalidReason : reason)?.trim())
        throw Error("Write the reason to disqualify.");
      ctx.update(fn);
      setError("");
      if (open) ctx.open(c);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <div className="flexrow">
        {c.phone && (
          <a className="btn dark" href={"tel:" + c.phone}>
            Call now
          </a>
        )}
        <span>
          {c.city} · {c.product}
        </span>
      </div>
      <section className="card card-b">
        <div className="cols2">
          <div className="soft">
            <b>
              {c.psm
                ? "From PSM " + c.psm
                : "Added by SM " + (c.sm || window.People.list[0].name)}
            </b>
            <div className="g2">
              <Field
                label="Phone"
                type="tel"
                value={c.phone}
                onCommit={(value) =>
                  ctx.update(() => {
                    c.phone = value;
                  })
                }
              />
              <Field
                label="Budget given"
                value={c.budget}
                onCommit={(value) =>
                  ctx.update(() => {
                    c.budget = value;
                  })
                }
              />
              <Select
                label="Site type"
                value={c.siteType}
                options={[
                  "Apartment",
                  "Builder floor",
                  "Independent house",
                  "Villa",
                ]}
                onChange={(value) =>
                  ctx.update(() => {
                    c.siteType = value;
                  })
                }
              />
              <div>Received · {new Date(c.receivedAt).toLocaleString()}</div>
            </div>
            <Attachment
              owner={c.id}
              name={c.docs.layout}
              label="Layout"
              onUploaded={(name) =>
                ctx.update(() => {
                  c.docs.layout = name;
                })
              }
            />
            <Field
              label="PSM note"
              value={c.note}
              onCommit={(value) =>
                ctx.update(() => {
                  c.note = value;
                })
              }
            />
          </div>
          <div className="stack">
            {!invalid && <ClientArchitect c={c} ctx={ctx} />}
            <div className="soft">
              <b>PSM quality</b>
              <div className="g3">
                {[
                  ["valid", "Is this lead valid?"],
                  ...(!invalid
                    ? [
                        ["layout", "Layout correct?"],
                        ["budget", "Budget confirmed?"],
                      ]
                    : []),
                ].map(([key, label]) => (
                  <Choice
                    key={key}
                    label={label}
                    value={!v[key] ? "" : /^yes/i.test(v[key]) ? "Yes" : "No"}
                    onChange={(value) =>
                      ctx.update(() => {
                        v[key] = value;
                      })
                    }
                  />
                ))}
              </div>
            </div>
            {invalid ? (
              <>
                <Field
                  label="Why is it not valid? The reason for not buying Magppie"
                  value={v.invalidReason}
                  onCommit={(value) =>
                    ctx.update(() => {
                      v.invalidReason = value;
                    })
                  }
                />
                {live && (
                  <Button
                    tone="warn"
                    onClick={() => act(() => disqualify(c, v.invalidReason))}
                  >
                    Disqualify this lead
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="soft">
                  <b>Basic info</b>
                  <div className="g3">
                    <Select
                      label="Segment"
                      value={c.segment}
                      options={["Retail", "Pro-Retail", "Projects"]}
                      onChange={(value) =>
                        ctx.update(() => {
                          c.segment = value;
                        })
                      }
                    />
                    <Select
                      label="Kitchen type"
                      value={v.kitchenType}
                      options={kitchenTypes}
                      onChange={(value) =>
                        ctx.update(() => {
                          v.kitchenType = value;
                        })
                      }
                    />
                    <Select
                      label="Design theme"
                      value={v.theme}
                      options={themes}
                      onChange={(value) =>
                        ctx.update(() => {
                          v.theme = value;
                        })
                      }
                    />
                    <Select
                      label="Priority prospect"
                      value={c.priority}
                      options={["High", "Medium", "Low"]}
                      onChange={(value) =>
                        ctx.update(() => {
                          c.priority = value;
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
                      onChange={(value) =>
                        ctx.update(() => {
                          c.trust = value;
                        })
                      }
                    />
                  </div>
                </div>
                <ContactForm c={c} ctx={ctx} qualified />
                {live && (
                  <>
                    <Button
                      tone="dark"
                      onClick={() => act(() => acceptLead({ c, ctx }), true)}
                    >
                      Accept and start DRF
                    </Button>
                    <Field
                      label="Disqualify reason"
                      value={reason}
                      immediate
                      onCommit={setReason}
                    />
                    <Button
                      tone="warn"
                      onClick={() => act(() => disqualify(c, reason))}
                    >
                      Disqualify
                    </Button>
                  </>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="msg">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
