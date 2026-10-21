import type { DesignClient as Client, Dates } from "./model";
import { rules } from "./model";
export class ValidationError extends Error {
  name = "ValidationError";
}
export const now = () => new Date().toISOString();
export function news(c: Client, text: string, tone = "blue") {
  window.Kit.news(c, text, tone, "Design");
}
export function sendProposal(
  c: Client,
  d: { amount: string; estimate: string; design: string; note: string },
) {
  if (c.stage !== "design" || c.design.step !== "withDesign")
    throw new ValidationError("This proposal is no longer waiting for Design.");
  const amount = Number(d.amount.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0)
    throw new ValidationError("Enter a positive estimate total.");
  const v = c.design.proposals.length + 1;
  c.design.proposals.push({
    v,
    amount,
    file: d.estimate,
    designFile: d.design,
    note: d.note,
    receivedAt: now(),
    status: "To share",
  });
  c.design.step = "toShare";
  c.design.stepAt = now();
  c.design.newProposal = true;
  c.design.promisedBy = "";
  news(
    c,
    "Proposal V" + v + " came from Design · ₹" + amount.toLocaleString("en-IN"),
    "green",
  );
}
export function overwriteTimeline(c: Client, dates: Dates) {
  const before = rules().dates(c);
  if (!before)
    throw new ValidationError("No handover date has been entered yet.");
  if (
    Object.values(dates).some(
      (v) => !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)),
    )
  )
    throw new ValidationError("Enter all four timeline dates.");
  (c.timelineChanges ||= []).push({
    at: now(),
    by: "Design",
    before: { ...before },
    after: { ...dates },
  });
  c.timeline.type = "Custom";
  c.timeline.handover = dates.handover;
  c.timeline.custom = {
    signoff: dates.signoff,
    pdi: dates.pdi,
    dispatch: dates.dispatch,
  };
  c.approvals.timeline = "Overwritten";
  news(
    c,
    "Design changed the timeline · handover now " +
      window.Kit.day(dates.handover),
    "yellow",
  );
}
export function recordEpt(c: Client, step: string, note: string) {
  const L = rules();
  if (!L.EPT_STEPS.includes(step))
    throw new ValidationError("Choose where the EPT is now.");
  const e = L.flow(c).ept;
  L.flowLog(e, step, note);
  e.step = step;
  if (step === "Client signed the EPT") {
    e.signedAt = now();
    news(c, step, "green");
  } else if (step === "Client asked for changes") {
    e.signedAt = "";
    news(
      c,
      "Client asked for EPT changes" + (note ? ": " + note : ""),
      "yellow",
    );
  }
}
export function addAppliance(
  c: Client,
  name: string,
  make: string,
  note: string,
) {
  if (!name.trim()) throw new ValidationError("Write the appliance first.");
  const a = rules().flow(c).appliances;
  a.items.push({
    name: name.trim(),
    make: make.trim(),
    note: note.trim(),
    at: now(),
  });
  a.signedAt = "";
}
export function applianceAction(
  c: Client,
  action: "send" | "return" | "sign",
  note = "",
) {
  const L = rules(),
    a = L.flow(c).appliances;
  if (action !== "return" && !a.items.length)
    throw new ValidationError("Add the appliances first.");
  if (action === "send") L.flowLog(a, "List sent to client");
  if (action === "return") {
    L.flowLog(a, "Client sent the list back", note);
    a.signedAt = "";
    news(
      c,
      "Client sent the appliance list back" + (note ? ": " + note : ""),
      "yellow",
    );
  }
  if (action === "sign") {
    a.signedAt = now();
    L.flowLog(a, "Client signed the list");
    news(c, "Client signed the appliance list", "green");
  }
}
export function designAction(
  c: Client,
  action: "send" | "return" | "approve" | "signed",
  note = "",
) {
  const L = rules(),
    g = L.flow(c).design;
  if (action === "signed") {
    if (!L.gateOpen(c, "drawing"))
      throw new ValidationError(
        "Accounts must approve the production drawing gate first.",
      );
    c.drawingSignedAt = now();
    news(c, "Client signed the production drawing", "green");
  }
  if (action === "send") L.flowLog(g, "Design sent to client");
  if (action === "return") {
    L.flowLog(g, "Client returned the design", note);
    g.approvedAt = "";
    news(c, "Client returned the design" + (note ? ": " + note : ""), "yellow");
  }
  if (action === "approve") {
    if (!L.siteMeasured(c))
      throw new ValidationError(
        "The first site measurement must be done first.",
      );
    g.approvedAt = now();
    L.flowLog(g, "Design approved");
    news(c, "Final design approved · next: appliances, then EPT", "green");
  }
}
export function approvePdi(c: Client) {
  const L = rules(),
    p = L.flow(c).pdi;
  if (!L.readyForPdi(c))
    throw new ValidationError(
      "Design, appliances and EPT must all be done first.",
    );
  if (p.approvedAt) return;
  p.approvedAt = now();
  L.flowLog(p, "PDI approved");
  news(c, "PDI approved", "green");
  if (
    !c.factoryAt &&
    L.handed(c) &&
    L.collectionDone(c) &&
    L.gateOpen(c, "factory")
  ) {
    c.factoryAt = now();
    c.factoryMail = { state: "queued" };
    window.Kit.news(
      c,
      "PDI approved, 80% in and Accounts go-ahead · order shot to the Factory",
      "green",
      "Accounts",
    );
  }
}
