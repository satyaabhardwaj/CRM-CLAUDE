import type { SalesStore } from "./data";
import { clients, rules } from "./model";
import { recordSignature, signingBody, signRequest } from "./OcfForm";
import { now } from "./ui";
// Preserve the existing opt-in automation. The provider status is authoritative.
// Never retry a signature send automatically: an interrupted response may have sent mail.
export async function startAutoSign(store: SalesStore) {
  let enabled = false;
  try {
    enabled = !!(await signRequest("/api/sign/status")).on;
  } catch {
    return () => {};
  }
  if (!enabled) return () => {};
  let busy = false;
  const idle = () =>
    new Promise<void>((resolve) => {
      if (!store.state.dirty && !store.state.saving) {
        resolve();
        return;
      }
      const stop = store.subscribe(() => {
        if (!store.state.dirty && !store.state.saving) {
          stop();
          resolve();
        }
      });
    });
  const tick = async () => {
    if (
      busy ||
      !store.state.ready ||
      !store.state.writable ||
      store.state.dirty ||
      document.hidden ||
      document.querySelector("dialog[open]") ||
      document.activeElement?.matches("input,textarea,select")
    )
      return;
    const L = rules(),
      c = clients(window.Kit.store.data.clients).find(
        (c) =>
          c.stage === "booked" &&
          L.tokenIn(c) &&
          L.totals(c).total > 0 &&
          c.email &&
          !c.ocfSign &&
          !c.ocfSignTried,
      );
    if (!c) return;
    busy = true;
    try {
      const body = signingBody(c);
      // Save the attempt before sending so a reload cannot silently send it twice.
      store.update(() => {
        c.ocfSignTried = now();
      });
      await idle();
      if (!store.state.writable || !c.ocfSignTried || c.ocfSign) return;
      const out = await signRequest("/api/sign/send", body);
      await idle();
      store.update(() => recordSignature(c, out, body.filename, true));
    } catch (e) {
      await idle();
      store.update(() => {
        c.ocfSignProblem =
          e instanceof Error
            ? e.message
            : "Send was not confirmed. Check Zoho Sign before retrying.";
      });
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 15000);
  return () => clearInterval(timer);
}
