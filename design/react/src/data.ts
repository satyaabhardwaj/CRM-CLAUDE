import { rules } from "./model";
import type { Store, Client } from "./types";
import {
  SessionEnded,
  sessionEnded,
  keepDrafts,
  readDrafts,
  clearDrafts,
  changedRecords,
  replay,
  type Draft,
  canEdit,
} from "../../../shared/session";
const MODULE = "design";
export function copy<T>(v: T): T {
  return structuredClone(v);
}
function reconcile(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const key of Object.keys(target))
    if (!(key in source)) delete target[key];
  for (const [key, value] of Object.entries(source)) {
    const old = target[key];
    if (
      value &&
      old &&
      typeof value === "object" &&
      typeof old === "object" &&
      !Array.isArray(value) &&
      !Array.isArray(old)
    )
      reconcile(
        old as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    else target[key] = copy(value);
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function normalize(data: Store): Store {
  const next = copy(data);
  next.clients.forEach((c) => {
    window.SalesLogic.ensure(c);
    rules().flow(c);
  });
  return next;
}
export async function readStore(): Promise<Store> {
  const r = await fetch("/api/store", {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 401) throw new SessionEnded();
  if (!r.ok)
    throw Error(
      r.status === 403
        ? "You do not have access to Design."
        : "Saved data could not be loaded. Please retry.",
    );
  const d = await r.json();
  if (
    !d ||
    !Array.isArray(d.clients) ||
    typeof d.rev !== "number" ||
    d.clients.some(
      (c: Client) =>
        !c || typeof c.id !== "string" || typeof c.cid !== "string",
    )
  )
    throw Error("Saved data has an invalid format.");
  return d;
}
export class Conflict extends Error {}
export { uploadAttachment as upload } from "../../../shared/uploads";
// Rebase unrelated records only. Never overwrite a concurrent edit to a changed client.
export function merge(
  base: Store,
  draft: Store,
  latest: Store,
  rawBase: Store = base,
): Store {
  const result = copy(latest);
  const old = new Map(base.clients.map((c) => [c.id, c]));
  const current = new Map(latest.clients.map((c) => [c.id, c]));
  const original = new Map(rawBase.clients.map((c) => [c.id, c]));
  for (const c of draft.clients) {
    const before = old.get(c.id);
    if (same(before, c)) continue;
    const now = current.get(c.id);
    if (same(now, c)) continue; // A previous request succeeded but its response was lost.
    if (!same(now, original.get(c.id)))
      throw new Conflict(
        "This client changed in another window. Your draft is retained. Reload saved data before editing again.",
      );
    const value = copy(c),
      index = result.clients.findIndex((x) => x.id === c.id);
    if (index < 0) {
      window.Kit.store.onAdd?.(value, result.clients);
      result.clients.push(value);
    } else result.clients[index] = value;
  }
  for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
    if (key === "rev" || key === "clients" || same(base[key], draft[key]))
      continue;
    if (!same(latest[key], base[key]) && !same(latest[key], draft[key]))
      throw new Conflict(
        "Shared Design settings changed in another window. Your draft is retained. Reload saved data before editing again.",
      );
    if (key in draft) result[key] = copy(draft[key]);
    else delete result[key];
  }
  return result;
}
export async function persist(
  base: Store,
  draft: Store,
  rawBase: Store = base,
): Promise<Store> {
  for (let tries = 0; tries < 3; tries++) {
    const latest = await readStore();
    const next = merge(base, draft, latest, rawBase);
    if (same(next, latest)) return latest;
    const r = await fetch("/api/store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
      signal: AbortSignal.timeout(20000),
    });
    if (r.status === 409) continue;
    if (r.status === 401) throw new SessionEnded();
    if (!r.ok)
      throw Error(
        r.status === 403
          ? "You do not have permission to save."
          : "Changes were not confirmed. Your draft is retained; retry saving.",
      );
    const out = await r.json();
    if (typeof out.rev !== "number")
      throw Error("Save was not confirmed. Retry to check the saved data.");
    return { ...next, rev: out.rev };
  }
  throw new Conflict(
    "The data is changing in another window. Your draft is retained; retry saving.",
  );
}
export interface State {
  ready: boolean;
  saving: boolean;
  error: string;
  writable: boolean;
  serial: number;
  dirty: boolean;
  saved: boolean;
}
export class DesignStore {
  private queued: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private base: Store = { rev: 0, clients: [] };
  private pending: Store | null = null;
  private rawBase: Store = { rev: 0, clients: [] };
  private generation = 0;
  private user = "";
  state: State = {
    ready: false,
    saving: false,
    error: "",
    writable: false,
    serial: 0,
    dirty: false,
    saved: false,
  };
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
  async load() {
    try {
      const [d, r] = await Promise.all([
        readStore(),
        fetch("/api/auth/me", { signal: AbortSignal.timeout(20000) }),
      ]);
      const me = r.ok ? await r.json() : null;
      this.user = typeof me?.id === "string" ? me.id : "";
      const writable =
        r.status === 404 || r.status === 405
          ? true
          : !!me && canEdit(me.role, MODULE);
      this.install(d);
      this.notify({ ready: true, writable, error: "", dirty: false });
      if (writable) this.restoreDrafts(d);
    } catch (e) {
      if (e instanceof SessionEnded) return sessionEnded();
      this.notify({
        error: e instanceof Error ? e.message : "Could not load Design.",
      });
    }
  }
  private install(d: Store) {
    this.rawBase = copy(d);
    const next = normalize(d),
      current = window.Kit.store.data;
    if (current) {
      // Upload/voice callbacks can retain a client reference while a save finishes.
      // Keep client and nested object identity across successful refreshes.
      const at = new Map(current.clients.map((c) => [c.id, c]));
      const clients = next.clients.map((c) => {
        const existing = at.get(c.id);
        if (!existing) return c;
        reconcile(existing, c);
        return existing;
      });
      const list = current.clients;
      list.splice(0, list.length, ...clients);
      for (const key of Object.keys(current))
        if (key !== "clients" && !(key in next)) delete current[key];
      for (const key of Object.keys(next))
        if (key !== "clients") current[key] = copy(next[key]);
    } else window.Kit.store.data = next;
    this.base = copy(window.Kit.store.data);
  }
  redraw = () => this.notify();
  update = (change?: (() => void) | null) => {
    if (!change) {
      this.notify();
      return;
    }
    if (!this.state.writable) {
      this.notify({
        error: "View only: your role cannot change Design.",
      });
      return;
    }
    // Uploads, PIN lookups and signatures may finish during another save.
    // Keep their mutations until that save is confirmed (or explicitly discarded).
    if (this.state.saving || this.state.dirty) {
      this.queued.push(change);
      return;
    }
    const before = copy(window.Kit.store.data);
    try {
      change();
    } catch (e) {
      window.Kit.store.data = before;
      this.notify({
        error:
          e instanceof Error && e.name === "ValidationError"
            ? ""
            : e instanceof Error
              ? e.message
              : "Change could not be applied.",
      });
      return;
    }
    this.save();
  };
  save = () => {
    if (!this.state.writable) {
      this.notify({ error: "View only: your role cannot change Design." });
      return;
    }
    if (this.state.saving || this.pending) return;
    this.pending = copy(window.Kit.store.data);
    this.generation++;
    this.notify({ saving: true, dirty: true, error: "", saved: false });
    void this.flush();
  };
  private async flush() {
    if (!this.pending) return;
    try {
      const d = await persist(this.base, this.pending, this.rawBase);
      this.pending = null;
      if (this.user) clearDrafts(this.user, MODULE);
      this.install(d);
      this.notify({ saving: false, dirty: false, error: "", saved: true });
      const queued = this.queued.splice(0);
      if (queued.length)
        this.update(() => queued.forEach((change) => change()));
    } catch (e) {
      if (e instanceof SessionEnded) {
        this.keepDrafts();
        sessionEnded();
      }
      this.notify({
        saving: false,
        dirty: true,
        error:
          e instanceof Error
            ? e.message
            : "Save was not confirmed. Your draft is retained; retry saving.",
      });
    }
  }
  retry = () => {
    if (this.state.saving) return;
    this.notify({ saving: true, error: "" });
    void this.flush();
  };
  discard = async () => {
    if (this.state.saving) return;
    try {
      const d = await readStore();
      this.pending = null;
      this.queued = [];
      this.install(d);
      this.notify({ dirty: false, error: "", saved: false });
    } catch (e) {
      if (e instanceof SessionEnded) return sessionEnded();
      this.notify({
        error: e instanceof Error ? e.message : "Could not load saved data.",
      });
    }
  };
  async poll() {
    if (!this.state.ready || this.state.dirty || this.state.saving) return;
    const version = this.generation;
    try {
      const d = await readStore();
      if (version !== this.generation || this.state.dirty) return;
      if (d.rev !== this.base.rev) {
        this.install(d);
        this.notify({ error: "" });
      }
    } catch (e) {
      if (e instanceof SessionEnded) return sessionEnded();
      this.notify({
        error: e instanceof Error ? e.message : "Could not refresh saved data.",
      });
    }
  }
  // Session ended mid-save: keep what was not saved (per client) for after sign-in.
  private keepDrafts() {
    if (!this.user || !this.pending) return;
    const pending = this.pending,
      original = new Map(this.rawBase.clients.map((c) => [c.id, c]));
    const drafts: Record<string, Draft> = {};
    for (const [id, d] of Object.entries(
      changedRecords(this.base.clients, pending.clients),
    ))
      drafts[id] = { before: original.get(id), after: d.after };
    for (const key of new Set([
      ...Object.keys(this.base),
      ...Object.keys(pending),
    ]))
      if (
        key !== "rev" &&
        key !== "clients" &&
        !same(this.base[key], pending[key])
      )
        drafts["@" + key] = { before: this.rawBase[key], after: pending[key] };
    keepDrafts(this.user, MODULE, drafts);
  }
  // After signing in again: put the kept changes on the newest copy and save them once.
  private restoreDrafts(latest: Store) {
    const drafts = readDrafts(this.user, MODULE);
    if (!Object.keys(drafts).length) return;
    clearDrafts(this.user, MODULE);
    const records: Record<string, Draft<Client>> = {};
    const next = copy(window.Kit.store.data);
    const conflicts: string[] = [];
    let keys = 0;
    for (const [id, draft] of Object.entries(drafts)) {
      if (!id.startsWith("@")) {
        records[id] = draft as Draft<Client>;
        continue;
      }
      const key = id.slice(1);
      if (same(latest[key], draft.after)) continue;
      if (!same(latest[key], draft.before)) conflicts.push(key);
      else {
        next[key] = copy(draft.after);
        keys++;
      }
    }
    // Decide on the raw saved copy (what "before" was taken from), then apply onto the screen copy.
    const result = replay(latest.clients, records);
    for (const id of result.applied) {
      const index = next.clients.findIndex((c) => c.id === id);
      if (index < 0) next.clients.push(copy(records[id].after));
      else next.clients[index] = copy(records[id].after);
    }
    const names = [...result.conflicts, ...conflicts].map(
      (id) => latest.clients.find((c) => c.id === id)?.name || id,
    );
    if (!result.applied.length && !keys) {
      if (names.length)
        this.notify({
          error:
            "Your unsaved changes were not reapplied because the record changed meanwhile: " +
            names.join(", ") +
            ". Please redo them.",
        });
      return;
    }
    window.Kit.store.data = next;
    this.pending = copy(next);
    this.generation++;
    this.notify({
      saving: true,
      dirty: true,
      saved: false,
      error: names.length
        ? "Some unsaved changes were not reapplied because the record changed meanwhile: " +
          names.join(", ") +
          ". Please redo them."
        : "",
    });
    void this.flush();
  }
}
