import type { Store } from "./types";
export function normalize(raw: Store): Store {
  const data = structuredClone(raw);
  data.clients.forEach(window.SalesLogic.ensure);
  return data;
}
export async function readStore(): Promise<Store> {
  const r = await fetch("/api/store", {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 401) {
    location.assign("/login");
    throw Error("Please sign in again.");
  }
  if (!r.ok)
    throw Error(
      r.status === 403
        ? "You do not have access to Management."
        : "Management data could not be loaded. Please retry.",
    );
  const data = await r.json();
  if (
    !data ||
    !Number.isInteger(data.rev) ||
    data.rev < 0 ||
    !Array.isArray(data.clients) ||
    data.clients.some(
      (c: unknown) =>
        !c ||
        typeof c !== "object" ||
        typeof (c as { id?: unknown }).id !== "string",
    )
  )
    throw Error("Saved data has an invalid format.");
  return normalize(data);
}
export interface State {
  data: Store | null;
  loading: boolean;
  error: string;
  serial: number;
}
// Deliberately read-only. No save, upload, approval, mail or mutation API.
export class ManagementStore {
  private listeners = new Set<() => void>();
  private busy = false;
  state: State = { data: null, loading: false, error: "", serial: 0 };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  notify(p: Partial<State> = {}) {
    this.state = { ...this.state, ...p, serial: this.state.serial + 1 };
    this.listeners.forEach((fn) => fn());
  }
  // A background poll stays invisible: no loading state, and no redraw when the saved data
  // has the same revision as what is on screen.
  load = async (background = false) => {
    if (this.busy) return;
    this.busy = true;
    if (!background) this.notify({ loading: true });
    try {
      const data = await readStore();
      if (background && !this.state.error && this.state.data?.rev === data.rev)
        return;
      window.Kit.store.data = data;
      this.notify({ data, error: "" });
    } catch (e) {
      this.notify({
        error: e instanceof Error ? e.message : "Could not load Management.",
      });
    } finally {
      this.busy = false;
      if (!background) this.notify({ loading: false });
    }
  };
  poll = async () => {
    if (!this.busy) await this.load(true);
  };
  redraw = () => this.notify();
}
