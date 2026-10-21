import {
  rules,
  related,
  type SalesClient,
  type FormProps,
  type Revision,
} from "./model";
import { now } from "./ui";
export function news(c: SalesClient, text: string, tone = "blue") {
  (c.news ||= []).unshift({ at: now(), text, tone, from: "Sales" });
  c.news = c.news.slice(0, 20);
}
export function acceptLead({ c, ctx }: FormProps) {
  if (c.stage !== "qualified") throw Error("This lead has already moved on.");
  if (!c.spokeAt)
    throw Error(
      'Speak to the client first. Save a call with "Spoke to client".',
    );
  const at = now();
  for (const o of related(c, ctx))
    if (o.stage === "qualified") {
      o.stage = "design";
      o.design.step = "drf";
      o.design.stepAt = at;
      o.acceptedAt = at;
      o.spokeAt ||= c.spokeAt;
    }
  if (c.validation.kitchenType && !c.design.brief.kitchenType.length)
    c.design.brief.kitchenType.push(c.validation.kitchenType);
  if (c.validation.theme && !c.design.brief.theme)
    c.design.brief.theme = c.validation.theme;
}
export function disqualify(c: SalesClient, reason: string) {
  if (!reason.trim()) throw Error("Write the reason to disqualify.");
  if (c.stage !== "qualified") throw Error("This lead has already moved on.");
  c.stage = "lost";
  c.lostReason = reason.trim();
  c.lostAt = now();
}
export const requiredBrief = {
  presentation: "Design presentation",
  theme: "Design theme",
  ceilingHeight: "Ceiling height",
  kitchenHeight: "Kitchen height",
  island: "Island required",
  gas: "Gas arrangement",
  vastu: "Vastu requirement",
  requiredOn: "Design required on",
  room: "Room / area name",
} as const;
export function missingBrief(c: SalesClient) {
  const list: string[] = Object.entries(requiredBrief)
    .filter(([key]) => !c.design.brief[key as keyof typeof requiredBrief])
    .map(([, label]) => label);
  if (!c.design.brief.kitchenType.length) list.push("Kitchen type");
  if (!c.city || c.city === "City not set") list.push("City");
  return list;
}
export function sendBrief(c: SalesClient) {
  if (missingBrief(c).length || !c.design.designer)
    throw Error("Complete the DRF and choose a designer first.");
  c.design.step = "withDesign";
  c.design.stepAt = c.design.sentAt = now();
  news(c, "DRF sent to Design · designer " + c.design.designer);
}
export const hasArchitect = (c: SalesClient) =>
  c.architectInvolved ?? c.source === "Architect reference";
export function approveDesign(c: SalesClient) {
  const p = c.design.proposals.at(-1);
  if (c.stage !== "design" || c.design.step !== "withClient" || !p)
    throw Error("There is no proposal with the client to approve.");
  if (
    !c.docs.quotation ||
    !c.docs.drawing ||
    (hasArchitect(c) && !c.design.architectOk)
  )
    throw Error(
      "Signed quotation, signed drawing and any architect approval are required.",
    );
  p.status = "Approved";
  p.approvedAt = c.approvedAt = c.bookedAt = now();
  if (!c.order.products.length)
    c.order.products.push({
      product: "Kitchen",
      value: Math.round(p.amount / 1.18),
    });
  c.stage = "booked";
  news(
    c,
    "Client approved the design and signed · booked at " + p.amount,
    "green",
  );
}
export function reviseDesign(
  c: SalesClient,
  d: Omit<Revision, "at" | "ofVersion">,
) {
  if (!d.reason) throw Error("Choose the reason for revision.");
  const p = c.design.proposals.at(-1);
  if (!p || c.design.step !== "withClient")
    throw Error("There is no proposal with the client.");
  p.status = "Revised";
  c.design.revisions.push({
    ...d,
    by: d.by || "Client",
    at: now(),
    ofVersion: p.v,
  });
  news(c, "Revision asked on V" + p.v + ": " + d.reason, "yellow");
  c.design.step = "withDesign";
  c.design.stepAt = now();
}
export function handOver(c: SalesClient) {
  if (c.stage !== "booked" || rules().bookingLeft(c) !== 0)
    throw Error("Collect the booking share first.");
  c.stage = "post";
  c.movedAt = now();
  news(c, "Booking share is in · handed to Design", "green");
}
export function requestPayment(
  c: SalesClient,
  d: { amount: number; date: string; mode: string; proof: string },
) {
  if (!Number.isFinite(d.amount) || d.amount <= 0)
    throw Error("Enter a positive amount first.");
  c.payment.receipts.push({
    ...d,
    ref: "",
    kind: "bank",
    billing: c.billingPick,
    status: "Requested",
    requestedAt: now(),
  });
  news(c, "Sales says the client paid " + d.amount + " · to confirm");
}
export function submitBooking(c: SalesClient) {
  if (!rules().totals(c).total || !c.timeline.handover)
    throw Error("Fill the order value and handover date first.");
  c.submittedAt = now();
  if (["Not sent", "Rejected"].includes(c.approvals.booking))
    c.approvals.booking = "Pending";
  news(c, "Booking sent for approval · " + rules().totals(c).total);
}
