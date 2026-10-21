import { useState } from "react";
import type { FormProps } from "./model";
import {
  approveDesign,
  hasArchitect,
  missingBrief,
  reviseDesign,
  sendBrief,
} from "./commands";
import {
  Attachment,
  Button,
  Card,
  Check,
  day,
  Field,
  FileLink,
  money,
  now,
  Pill,
  Select,
} from "./ui";
import { ClientArchitect } from "./ArchitectPicker";
import { ContactForm } from "./ContactForm";
import { kitchenTypes, themes } from "./QualifiedForm";
const revisionReasons = [
  "New Items to be added",
  "Budget to be reduced",
  "Requirements were not clear",
  "Layout was incomplete",
  "Civil sizes changed later",
  "Decision maker changed",
  "Vaastu Issue",
  "Design is not as per brief",
  "Impractical design",
  "Estimate Error",
  "Price List Revised",
  "Product discontinued",
  "Add newly launched product",
  "Appliance / Accessory missing",
  "Design Manager changed",
  "Incomplete brief shared to designer",
  "Special approval - Management",
  "Sales manager changed",
];
export const proofFields = [
  ["Signed quotation", "quotation"],
  ["Signed drawing", "drawing"],
  ["Screenshot", "screenshot"],
  ["Recorded message", "recording"],
] as const;
export function ProofUploads({ c, ctx }: FormProps) {
  return (
    <>
      {proofFields.map(([label, key]) => (
        <Attachment
          key={key}
          owner={c.id}
          name={c.docs[key]}
          label={label}
          onUploaded={(name) =>
            ctx.update(() => {
              c.docs[key] = name;
            })
          }
        />
      ))}
    </>
  );
}
export function DesignForm({ c, ctx }: FormProps) {
  const b = c.design.brief,
    missing = missingBrief(c),
    p = c.design.proposals.at(-1),
    step = c.design.step || "drf";
  const [mode, setMode] = useState(""),
    [error, setError] = useState(""),
    [d, setDraft] = useState({ reason: "", by: "", notes: "", file: "" });
  const set = <K extends keyof typeof b>(key: K, value: (typeof b)[K]) =>
    ctx.update(() => {
      b[key] = value;
    });
  const text = (
    key: Exclude<keyof typeof b, "kitchenType">,
    label: string,
    type = "text",
  ) => (
    <Field
      label={label}
      value={b[key]}
      type={type}
      onCommit={(v) => set(key, v)}
    />
  );
  const select = (
    key: Exclude<keyof typeof b, "kitchenType">,
    label: string,
    options: string[],
  ) => (
    <Select
      label={label}
      value={b[key]}
      options={options}
      onChange={(v) => set(key, v)}
    />
  );
  const ready =
    !!c.docs.quotation &&
    !!c.docs.drawing &&
    (!hasArchitect(c) || !!c.design.architectOk);
  return (
    <div className="cols">
      <Card
        title="DRF · design briefing"
        meta={missing.length ? missing.length + " to fill" : "Complete"}
        tone="violet"
      >
        <div className="g2">
          {select("presentation", "Design presentation *", [
            "Kitchen 3D",
            "Kitchen L & F",
            "Kitchen L & F + EST",
            "Kitchen EST",
            "Kitchen 3D + EST",
          ])}
          {select("theme", "Design theme *", themes)}
          {text("ceilingHeight", "Ceiling height (mm) *")}
          {select("kitchenHeight", "Kitchen height (mm) *", ["2500", "2140"])}
          {select("island", "Island required *", [
            "No",
            "Both Side Storage",
            "One side storage & one side sitting",
          ])}
          {select("gas", "Gas arrangement *", [
            "Piped Gas",
            "Cylinder inside kitchen",
            "Cylinder outside kitchen",
          ])}
          {select("vastu", "Vastu requirement *", ["Yes", "No"])}
          {text("requiredOn", "Design required on *", "date")}
          <Field
            label="City *"
            value={c.city === "City not set" ? "" : c.city}
            onCommit={(v) =>
              ctx.update(() => {
                c.city = v;
              })
            }
          />
          {text("room", "Room / area name *")}
          {text("sqft", "Area (sq ft)")}
        </div>
        <div className="field">
          <span>Kitchen type *</span>
          <div className="checks">
            {kitchenTypes.map((k) => (
              <Check
                key={k}
                label={k}
                checked={b.kitchenType.includes(k)}
                onChange={(on) =>
                  set(
                    "kitchenType",
                    on
                      ? [...b.kitchenType, k]
                      : b.kitchenType.filter((x) => x !== k),
                  )
                }
              />
            ))}
          </div>
        </div>
        {[
          ["Drawings and video files", "drf"],
          ["House layout", "layout"],
        ].map(([label, key]) => (
          <Attachment
            key={key}
            label={label}
            owner={c.id}
            name={c.docs[key]}
            onUploaded={(name) =>
              ctx.update(() => {
                c.docs[key] = name;
              })
            }
          />
        ))}
        {text("notes", "Notes")}
        <ClientArchitect c={c} ctx={ctx} />
      </Card>
      <Card
        title={c.stage === "design" ? "Next step" : "Proposals"}
        tone="blue"
      >
        {c.stage === "design" && (
          <>
            {step === "drf" && (
              <>
                <Select
                  label="Designer allotted"
                  value={c.design.designer}
                  options={window.People.designers}
                  onChange={(v) =>
                    ctx.update(() => {
                      c.design.designer = v;
                    })
                  }
                />
                <Button
                  tone="dark"
                  disabled={missing.length > 0 || !c.design.designer}
                  onClick={() => ctx.update(() => sendBrief(c))}
                >
                  Send DRF to designer
                </Button>
                {missing.length > 0 ? (
                  <p className="msg">
                    Still to fill in the DRF: {missing.join(", ")}
                  </p>
                ) : (
                  !c.design.designer && (
                    <p className="msg">Choose the designer to send it to.</p>
                  )
                )}
              </>
            )}
            {step === "withDesign" && (
              <p>
                With{" "}
                {c.design.designer ? "designer " + c.design.designer : "Design"}{" "}
                · since {day(c.design.stepAt)}
              </p>
            )}
            {(step === "toShare" || step === "withClient") && !p && (
              <p role="alert">
                No proposal is available. Ask Design to add the proposal.
              </p>
            )}
            {step === "toShare" && p && (
              <>
                <div>
                  Proposal V{p.v} from Design ·{" "}
                  <FileLink owner={c.id} name={p.file} label="Open estimate" />{" "}
                  ·{" "}
                  <FileLink
                    owner={c.id}
                    name={p.designFile}
                    label="Open design"
                  />
                </div>
                {p.note && <p className="sub">Design note: {p.note}</p>}
                <Button
                  tone="dark"
                  onClick={() =>
                    ctx.update(() => {
                      p.status = "With client";
                      p.sharedAt = now();
                      c.design.newProposal = false;
                      c.design.step = "withClient";
                      c.design.stepAt = now();
                    })
                  }
                >
                  Shared with client
                </Button>
              </>
            )}
            {step === "withClient" && p && (
              <>
                <div>
                  Proposal V{p.v} with client
                  {hasArchitect(c) && " and architect"} · since{" "}
                  {day(c.design.stepAt)}
                </div>
                <div className="flexrow">
                  <Button
                    onClick={() => {
                      setMode(mode === "revise" ? "" : "revise");
                      setError("");
                    }}
                  >
                    {hasArchitect(c)
                      ? "Changes wanted"
                      : "Client wants changes"}
                  </Button>
                  <Button
                    onClick={() => {
                      setMode(mode === "approve" ? "" : "approve");
                      setError("");
                    }}
                  >
                    {hasArchitect(c)
                      ? "Client and architect approved"
                      : "Client approved design and price"}
                  </Button>
                </div>
                {mode === "revise" && (
                  <div className="soft">
                    <b>Revision form</b>
                    {hasArchitect(c) && (
                      <Select
                        label="Changes asked by"
                        value={d.by}
                        options={["Client", "Architect", "Both"]}
                        onChange={(by) => setDraft((x) => ({ ...x, by }))}
                      />
                    )}
                    <Select
                      label="Reason for revision"
                      value={d.reason}
                      options={revisionReasons}
                      onChange={(reason) => {
                        setDraft((x) => ({ ...x, reason }));
                        setError("");
                      }}
                    />
                    <Field
                      label="Notes"
                      value={d.notes}
                      immediate
                      onCommit={(notes) => setDraft((x) => ({ ...x, notes }))}
                    />
                    <Attachment
                      owner={c.id}
                      name={d.file}
                      label="Drawings and videos"
                      onUploaded={(file) => setDraft((x) => ({ ...x, file }))}
                    />
                    <Button
                      tone="dark"
                      onClick={() => {
                        if (!d.reason) {
                          setError("Choose the reason for revision.");
                          return;
                        }
                        ctx.update(() => reviseDesign(c, d));
                        setMode("");
                      }}
                    >
                      Send revision to Design
                    </Button>
                  </div>
                )}
                {mode === "approve" && (
                  <div className="soft">
                    <b>Approval proof</b>
                    <ProofUploads c={c} ctx={ctx} />
                    {hasArchitect(c) && (
                      <Check
                        label="Architect has approved too"
                        checked={c.design.architectOk}
                        onChange={(v) =>
                          ctx.update(() => {
                            c.design.architectOk = v;
                          })
                        }
                      />
                    )}
                    <Button
                      tone="dark"
                      disabled={!ready}
                      onClick={() => {
                        ctx.update(() => approveDesign(c));
                        ctx.open(c);
                      }}
                    >
                      Confirm approval · move to Booked
                    </Button>
                    {!ready && (
                      <p className="msg">
                        Still needed:{" "}
                        {[
                          !c.docs.quotation && "signed quotation",
                          !c.docs.drawing && "signed drawing",
                          hasArchitect(c) &&
                            !c.design.architectOk &&
                            "architect approval",
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="msg">
            {error}
          </p>
        )}
        {c.design.proposals
          .slice()
          .reverse()
          .map((p) => {
            const rev = c.design.revisions.find((r) => r.ofVersion === p.v);
            return (
              <div className="line rule" key={p.v}>
                <span>
                  <b>
                    Proposal V{p.v} · {money(p.amount)}
                  </b>
                  <div className="sub">
                    From Design {day(p.receivedAt)}
                    {p.sharedAt && " · shared " + day(p.sharedAt)}
                    {rev &&
                      " · revised: " + rev.reason + " (" + rev.by + ")"} ·{" "}
                    <FileLink owner={c.id} name={p.file} label="Estimate" /> ·{" "}
                    <FileLink owner={c.id} name={p.designFile} label="Design" />
                  </div>
                </span>
                <Pill tone={p.status === "Approved" ? "green" : "blue"}>
                  {p.status}
                </Pill>
              </div>
            );
          })}
      </Card>
      <ContactForm c={c} ctx={ctx} />
    </div>
  );
}
