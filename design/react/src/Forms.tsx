import { useState, type SetStateAction } from "react";
const drafts = new Map<string, unknown>();
function useDraft<T>(
  key: string,
  initial: T,
): [T, (value: SetStateAction<T>) => void] {
  const [value, render] = useState<T>(() =>
    drafts.has(key) ? (drafts.get(key) as T) : initial,
  );
  return [
    value,
    (next) => {
      const previous = drafts.has(key) ? (drafts.get(key) as T) : value;
      const result =
        typeof next === "function" ? (next as (v: T) => T)(previous) : next;
      drafts.set(key, result);
      render(result);
    },
  ];
}
import type { FormProps, Dates, Log } from "./model";
import { rules } from "./model";
import {
  Attachment,
  Button,
  Card,
  Field,
  FileLink,
  Select,
  Pill,
  day,
  money,
} from "./ui";
import { Facts } from "./Facts";
import { isRevision, pdiSince } from "./selectors";
import {
  sendProposal,
  overwriteTimeline,
  recordEpt,
  addAppliance,
  applianceAction,
  designAction,
  approvePdi,
  news,
  now,
} from "./commands";
export function History({ logs, limit }: { logs: Log[]; limit?: number }) {
  return logs.length ? (
    <>
      {logs
        .slice()
        .reverse()
        .slice(0, limit)
        .map((x, i) => (
          <div className="line rule" key={i}>
            <span>
              <b>{x.what}</b>
              {x.note && " · " + x.note}
            </span>
            <span className="sub">{window.Kit.dayTime(x.at)}</span>
          </div>
        ))}
    </>
  ) : (
    <p className="sub">Nothing recorded yet.</p>
  );
}
function useAction(ctx: FormProps["ctx"]) {
  const [error, setError] = useState("");
  return {
    error,
    clear: () => setError(""),
    run: (change: () => void) => {
      if (ctx.readOnly) return;
      try {
        ctx.update(() => {
          try {
            change();
            setError("");
          } catch (e) {
            setError((e as Error).message);
            throw e;
          }
        });
      } catch (e) {
        setError((e as Error).message);
      }
    },
  };
}
export function ProposalForm({ c, ctx }: FormProps) {
  const [draft, setDraft] = useDraft(c.id + "proposal", {
      amount: "",
      estimate: "",
      design: "",
      note: "",
    }),
    a = useAction(ctx),
    b = c.design.brief,
    rev = isRevision(c) ? c.design.revisions.at(-1) : null;
  return (
    <div className="cols2">
      <Card title="From Sales" tone="violet">
        {rev && (
          <div className="soft">
            <b>
              Change asked{rev.by ? " by " + rev.by.toLowerCase() : ""}:{" "}
              {rev.reason}
            </b>
            <p>{rev.notes}</p>
            <FileLink owner={c.id} name={rev.file} />
          </div>
        )}
        {[
          ["Drawings and video files", "drf"],
          ["Layout", "layout"],
        ].map(([label, key]) => (
          <div className="line rule" key={key}>
            <span>{label}</span>
            <FileLink owner={c.id} name={c.docs[key]} />
            {!c.docs[key] && "Not uploaded"}
          </div>
        ))}
        <Facts
          items={[
            ["Design presentation", b.presentation],
            ["Design theme", b.theme],
            ["Ceiling height (mm)", b.ceilingHeight],
            ["Design required on", b.requiredOn ? day(b.requiredOn) : ""],
            ["Room / area", b.room],
            ["Area (sq ft)", b.sqft],
            ["Vastu", b.vastu],
            ["Kitchen type", b.kitchenType.join(", ")],
            ["Kitchen height (mm)", b.kitchenHeight],
            ["Island", b.island],
            ["Gas", b.gas],
            ["City", c.city],
            ["Notes", b.notes],
            ["Budget", c.budget],
            ["Segment", c.segment],
          ]}
        />
      </Card>
      <Card
        title={"Send proposal V" + (c.design.proposals.length + 1)}
        tone="blue"
      >
        <Field
          label="I will send it by"
          type="date"
          value={c.design.promisedBy}
          onCommit={(v) =>
            ctx.update(() => {
              c.design.promisedBy = v;
              if (v)
                news(
                  c,
                  (c.design.designer
                    ? "Designer " + c.design.designer
                    : "The designer") +
                    " promised the design by " +
                    day(v),
                  "grey",
                );
            })
          }
        />
        <Field
          label="Estimate total (₹), including GST"
          value={draft.amount}
          immediate
          onCommit={(v) => {
            setDraft({ ...draft, amount: v });
            a.clear();
          }}
        />
        {(["estimate", "design"] as const).map((k) => (
          <Attachment
            key={k}
            label={k === "estimate" ? "Estimate" : "Design / floor plan"}
            owner={c.id}
            name={draft[k]}
            onUploaded={(v) => setDraft((d) => ({ ...d, [k]: v }))}
          />
        ))}
        <Field
          label="Note for Sales"
          value={draft.note}
          immediate
          onCommit={(v) => setDraft({ ...draft, note: v })}
        />
        {a.error && (
          <p role="alert" className="msg">
            {a.error}
          </p>
        )}
        <Button
          tone="dark"
          disabled={ctx.readOnly || c.design.step !== "withDesign"}
          onClick={() =>
            a.run(() => {
              sendProposal(c, draft);
              drafts.delete(c.id + "proposal");
              ctx.close();
            })
          }
        >
          Send to {window.People.owner(c)}
        </Button>
      </Card>
    </div>
  );
}
export function TimelineForm({ c, ctx }: FormProps) {
  const original = rules().dates(c),
    [draft, setDraft] = useDraft<Dates>(
      c.id + "timeline",
      original || { signoff: "", pdi: "", dispatch: "", handover: "" },
    ),
    a = useAction(ctx);
  const labels: [keyof Dates, string][] = [
    ["signoff", "Drawing signoff"],
    ["pdi", "PDI"],
    ["dispatch", "Dispatch"],
    ["handover", "Pooja / handover"],
  ];
  return (
    <div className="cols2">
      <Card title="Timeline from Sales" tone="violet">
        {original ? (
          <Facts
            items={[
              ["Timeline", c.timeline.type],
              ["Production days", String(c.timeline.productionDays)],
              ...labels.map(
                ([key, label]) =>
                  [label, day(original[key])] as [string, string],
              ),
            ]}
          />
        ) : (
          <p>No handover date has been entered yet.</p>
        )}
      </Card>
      {original && (
        <Card title="Overwrite with your dates" tone="teal">
          <div className="g2">
            {labels.map(([key, label]) => (
              <Field
                key={key}
                label={label}
                type="date"
                value={draft[key]}
                immediate
                onCommit={(v) => {
                  setDraft({ ...draft, [key]: v });
                  a.clear();
                }}
              />
            ))}
          </div>
          {a.error && (
            <p role="alert" className="msg">
              {a.error}
            </p>
          )}
          <Button
            disabled={
              ctx.readOnly ||
              !labels.some(([key]) => draft[key] !== original[key])
            }
            onClick={() =>
              a.run(() => {
                overwriteTimeline(c, draft);
                drafts.delete(c.id + "timeline");
                ctx.close();
              })
            }
          >
            Overwrite timeline
          </Button>
        </Card>
      )}
    </div>
  );
}
export function MeasurementForm({ c, ctx }: FormProps) {
  const m = rules().measureState(c);
  return (
    <div className="cols2">
      <Card title="First site measurement" tone="violet">
        {[
          ["Sent", m.sentAt, c.measurement?.by ? "by " + c.measurement.by : ""],
          [
            "Aligned",
            m.alignedAt,
            [m.visit ? "visit " + day(m.visit) : "", m.who]
              .filter(Boolean)
              .join(" · "),
          ],
          ["Done", m.doneAt, ""],
        ].map(([label, at, note], i) => (
          <div className="line rule" key={label}>
            <span>
              <b>
                {i + 1} · {label}
              </b>
              {note && " · " + note}
            </span>
            <Pill tone={at ? "green" : "grey"}>
              {at ? (at === "recorded" ? "Recorded" : day(at)) : "Not yet"}
            </Pill>
          </div>
        ))}
        {!c.measurement && (
          <Button
            tone="dark"
            onClick={() =>
              ctx.update(() => {
                rules().sendMeasurement(c, "Design");
              })
            }
          >
            Send to Measurement
          </Button>
        )}
        <p className="hint">
          Aligned and Done are filled in by the measurement person on the
          Measurement screen.
        </p>
      </Card>
      <Card title="Notes" tone="blue">
        {c.measurement ? (
          <Field
            label="Note for the measurement (both teams see it)"
            value={m.note}
            onCommit={(v) =>
              ctx.update(() => {
                if (c.measurement) {
                  c.measurement.note = v;
                  c.measurement.changedAt = now();
                }
              })
            }
          />
        ) : (
          <p>Send the request first; then a note can be added.</p>
        )}
      </Card>
    </div>
  );
}
export function EptForm({ c, ctx }: FormProps) {
  const L = rules(),
    e = L.flow(c).ept,
    s = L.flowState(c).ept,
    [step, setStep] = useDraft(c.id + "ept-step", ""),
    [note, setNote] = useDraft(c.id + "ept-note", ""),
    a = useAction(ctx);
  return (
    <div className="cols2">
      <Card title="Where the EPT is now" tone="blue">
        <Facts
          items={[
            ["Now", s.step],
            ["Sent to client", s.sent + " time(s)"],
            ["Returned with changes", s.returned + " time(s)"],
            ["Signed by client", e.signedAt ? day(e.signedAt) : "Not yet"],
          ]}
        />
        <Select
          label="Move the EPT to"
          value={step}
          options={L.EPT_STEPS}
          onChange={(v) => {
            setStep(v);
            a.clear();
          }}
        />
        <Field
          label="Note (optional)"
          value={note}
          immediate
          onCommit={setNote}
        />
        {a.error && (
          <p role="alert" className="msg">
            {a.error}
          </p>
        )}
        <Button
          tone="dark"
          onClick={() =>
            a.run(() => {
              recordEpt(c, step, note);
              setStep("");
              setNote("");
            })
          }
        >
          Record
        </Button>
        <Attachment
          label="Signed EPT"
          owner={c.id}
          name={e.file}
          onUploaded={(v) =>
            ctx.update(() => {
              L.flow(c).ept.file = v;
            })
          }
        />
      </Card>
      <Card title="History" meta={e.log.length + " entries"}>
        <History logs={e.log} />
        {!e.log.length && (
          <p>
            {L.siteMeasured(c)
              ? "Site measured. Nothing recorded on the EPT yet."
              : "Waiting for the first site measurement."}
          </p>
        )}
      </Card>
    </div>
  );
}
export function AppliancesForm({ c, ctx }: FormProps) {
  const L = rules(),
    ap = L.flow(c).appliances,
    s = L.flowState(c).appliances,
    [draft, setDraft] = useDraft(c.id + "appliances", {
      name: "",
      make: "",
      note: "",
      back: "",
    }),
    a = useAction(ctx);
  const field = (k: keyof typeof draft, label: string) => (
    <Field
      label={label}
      value={draft[k]}
      immediate
      onCommit={(v) => {
        setDraft({ ...draft, [k]: v });
        a.clear();
      }}
    />
  );
  return (
    <div className="cols2">
      <Card
        title={"Appliance list · " + ap.items.length + " item(s)"}
        tone="blue"
      >
        {ap.items.map((item, i) => (
          <div className="line rule" key={i}>
            <span>
              <b>{item.name}</b>
              {item.make && " · " + item.make}
              {item.note && " · " + item.note}
            </span>
            <Button
              tone="small line"
              onClick={() =>
                ctx.update(() => {
                  ap.items.splice(i, 1);
                  ap.signedAt = "";
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        {!ap.items.length && <p>No appliances on the list yet.</p>}
        <div className="g3">
          {field("name", "Appliance")}
          {field("make", "Brand / model")}
          {field("note", "Note")}
        </div>
        {a.error && (
          <p role="alert" className="msg">
            {a.error}
          </p>
        )}
        <Button
          onClick={() =>
            a.run(() => {
              addAppliance(c, draft.name, draft.make, draft.note);
              setDraft({ ...draft, name: "", make: "", note: "" });
            })
          }
        >
          Add appliance
        </Button>
      </Card>
      <Card title="With the client" tone="violet">
        <Facts
          items={[
            ["Sent to client", s.sent + " time(s)"],
            ["Sent back by client", s.returned + " time(s)"],
            ["Signed by client", ap.signedAt ? day(ap.signedAt) : "Not yet"],
          ]}
        />
        <Button onClick={() => a.run(() => applianceAction(c, "send"))}>
          List sent to client
        </Button>
        {field("back", "If the client sent it back: what they want changed")}
        <Button
          onClick={() =>
            a.run(() => {
              applianceAction(c, "return", draft.back);
              setDraft({ ...draft, back: "" });
            })
          }
        >
          Client sent the list back
        </Button>
        {ap.signedAt ? (
          <Pill tone="green">Signed {day(ap.signedAt)}</Pill>
        ) : (
          <Button
            tone="dark"
            onClick={() => a.run(() => applianceAction(c, "sign"))}
          >
            Client signed the appliance list
          </Button>
        )}
        <Attachment
          owner={c.id}
          label="Signed appliance list"
          name={ap.file}
          onUploaded={(v) =>
            ctx.update(() => {
              L.flow(c).appliances.file = v;
            })
          }
        />
        <History logs={ap.log} limit={6} />
      </Card>
    </div>
  );
}
export function DesignFlowForm({ c, ctx }: FormProps) {
  const L = rules(),
    g = L.flow(c).design,
    s = L.flowState(c).design,
    [back, setBack] = useDraft(c.id + "design-back", ""),
    a = useAction(ctx),
    ready = L.siteMeasured(c);
  return (
    <div className="cols2">
      <Card title="Before the design can be final" tone="violet">
        <div className="line rule">
          <span>1 · First site measurement done</span>
          <Pill tone={ready ? "green" : c.measurement ? "yellow" : "red"}>
            {ready ? "Done" : c.measurement ? "In progress" : "Not started"}
          </Pill>
        </div>
        <div className="line rule">
          <span>Production drawing signed by client</span>
          {c.drawingSignedAt ? (
            <Pill tone="green">Signed {day(c.drawingSignedAt)}</Pill>
          ) : L.gateOpen(c, "drawing") ? (
            <Button onClick={() => a.run(() => designAction(c, "signed"))}>
              Client signed it
            </Button>
          ) : (
            <Pill tone="yellow">
              {L.gate(c, "drawing").short
                ? "Waiting for 80% · " +
                  window.Kit.short(L.gate(c, "drawing").short) +
                  " to come"
                : "80% in · waiting for Accounts"}
            </Pill>
          )}
        </div>
      </Card>
      <Card title="The design" tone="blue">
        <Facts
          items={[
            ["Sent to client", s.sent + " time(s)"],
            ["Returned by client", s.returned + " time(s)"],
            ["Final approval", g.approvedAt ? day(g.approvedAt) : "Not yet"],
          ]}
        />
        <Button onClick={() => a.run(() => designAction(c, "send"))}>
          Design sent to client
        </Button>
        <Field
          label="If the client returned it: what they want changed"
          value={back}
          immediate
          onCommit={(v) => {
            setBack(v);
            a.clear();
          }}
        />
        <Button
          onClick={() =>
            a.run(() => {
              designAction(c, "return", back);
              setBack("");
            })
          }
        >
          Client returned the design
        </Button>
        {g.approvedAt ? (
          <Pill tone="green">Approved {day(g.approvedAt)}</Pill>
        ) : (
          <Button
            tone={ready ? "dark" : "line"}
            onClick={() => a.run(() => designAction(c, "approve"))}
          >
            Design approved (final)
          </Button>
        )}
        {a.error && (
          <p role="alert" className="msg">
            {a.error}
          </p>
        )}
        <History logs={g.log} limit={6} />
      </Card>
    </div>
  );
}
export function PdiForm({ c, ctx }: FormProps) {
  const L = rules(),
    p = L.flow(c).pdi,
    a = useAction(ctx);
  return (
    <Card title="PDI" tone="teal">
      <Facts
        items={[
          [
            "PDI visits recorded",
            String(p.log.filter((x) => x.what === "PDI visit done").length),
          ],
          ["PDI approved", p.approvedAt ? day(p.approvedAt) : "Not yet"],
          [
            "80% collection",
            L.collectionDone(c)
              ? "Done"
              : window.Kit.short(L.productionRow(c).due) + " still to come",
          ],
          ["Ready since", pdiSince(c) ? day(pdiSince(c)) : "Not yet"],
        ]}
      />
      <div className="flexrow">
        <Button
          onClick={() =>
            ctx.update(() => {
              L.flowLog(p, "PDI visit done");
              news(c, "PDI visit done");
            })
          }
        >
          PDI visit done
        </Button>
        {!p.approvedAt && (
          <Button
            tone="dark"
            disabled={!L.readyForPdi(c)}
            onClick={() => a.run(() => approvePdi(c))}
          >
            PDI approved
          </Button>
        )}
      </div>
      {!L.readyForPdi(c) && (
        <p>Design, appliances and EPT must all be done first.</p>
      )}
      {a.error && <p role="alert">{a.error}</p>}
      <p className="sub">
        Once the PDI is approved and 80% is in, Accounts gives the factory
        go-ahead; then the order is shot to the factory and the factory is
        emailed.
      </p>
    </Card>
  );
}
