// Prepared and mock-tested only. Not imported by main.tsx: user requested automatic Design factory emails remain disabled.
import type { DesignStore } from "./data";
import { clients, rules, type DesignClient } from "./model";
export function factoryMessage(c: DesignClient) {
  const L = rules(),
    f = L.flow(c),
    d = L.dates(c),
    K = window.Kit;
  const body = [
    "An order has been shot to the Factory.",
    "",
    "Client: " + c.name,
    "Project: " + c.pid + "   Customer: " + c.cid,
    "Designer: " + (c.design.designer || "not allotted"),
    "Sales manager: " + (c.sm || window.People.owner(c)),
    "PDI approved: " + K.day(f.pdi.approvedAt),
    "EPT signed: " + (f.ept.signedAt ? K.day(f.ept.signedAt) : "not recorded"),
    "Appliance list signed: " +
      (f.appliances.signedAt ? K.day(f.appliances.signedAt) : "not recorded"),
    "Design approved: " +
      (f.design.approvedAt ? K.day(f.design.approvedAt) : "not recorded"),
    "Order value: Rs " + L.totals(c).total.toLocaleString("en-IN"),
    "Received so far: Rs " + L.collected(c).toLocaleString("en-IN"),
    d
      ? "Dispatch: " + K.day(d.dispatch) + "   Handover: " + K.day(d.handover)
      : "Dates: not set",
    "",
    "Sent by the Magppie CRM.",
  ].join("\n");
  return {
    kind: "factory",
    subject: "Order shot to Factory: " + c.name + " (" + c.pid + ")",
    body,
  };
}
// Claim through the revision-checked store before sending. A failed/ambiguous send is
// never retried automatically. Another tab cannot send without winning the claim.
export function watchFactoryMail(store: DesignStore) {
  let active = false,
    stopped = false;
  const idle = () =>
    new Promise<void>((resolve) => {
      if (!store.state.dirty) return resolve();
      const unsub = store.subscribe(() => {
        if (!store.state.dirty) {
          unsub();
          resolve();
        }
      });
    });
  const tick = async () => {
    if (
      stopped ||
      active ||
      !store.state.ready ||
      !store.state.writable ||
      store.state.dirty ||
      store.state.error
    )
      return;
    const c = clients(window.Kit.store.data.clients).find(
      (c) => c.factoryAt && c.factoryMail?.state === "queued",
    );
    if (!c) return;
    active = true;
    const attempt = crypto.randomUUID();
    store.update(() => {
      c.factoryMail = { state: "sending", attempt };
    });
    await idle();
    // Discard or conflict recovery may have installed somebody else's claim.
    if (
      !stopped &&
      c.factoryMail?.attempt === attempt &&
      c.factoryMail.state === "sending"
    ) {
      let result: DesignClient["factoryMail"];
      try {
        const r = await fetch("/api/mail/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(factoryMessage(c)),
          signal: AbortSignal.timeout(20000),
        });
        const out = await r.json();
        result =
          r.ok && out.sent
            ? {
                state: "sent",
                at: new Date().toISOString(),
                to: out.to,
                test: !!out.test,
              }
            : {
                state: "not sent",
                why:
                  out.error === "no key"
                    ? "Email is not switched on yet."
                    : "Email was not confirmed. Check delivery before resending.",
              };
      } catch {
        result = {
          state: "not sent",
          why: "Email was not confirmed. Check delivery before resending.",
        };
      }
      store.update(() => {
        if (c.factoryMail?.attempt === attempt) c.factoryMail = result;
      });
    }
    active = false;
    void tick();
  };
  const unsubscribe = store.subscribe(() => {
    void tick();
  });
  void tick();
  return () => {
    stopped = true;
    unsubscribe();
  };
}
