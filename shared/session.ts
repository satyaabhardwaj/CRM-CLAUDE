// Session end without lost work (owner decision, 22 Oct 2026). Used by every module and the auth shell.
// Drafts hold client records only (no secrets), per user + module + client, in this tab's sessionStorage.
// They are cleared after a successful save or on sign-out.

export class SessionEnded extends Error {
  constructor() {
    super("Session ended — sign in again.");
  }
}

// Only same-origin relative paths: one leading "/", no "//", no scheme, no backslash, no control
// characters, and the same after decoding (so "%2F%2F" or "%5C" tricks are refused too).
export function safeNext(value: string | null | undefined): string | null {
  if (!value || value.length > 2000) return null;
  let decoded = value;
  try {
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }
  for (const text of [value, decoded]) {
    if (!text.startsWith("/") || text.startsWith("//")) return null;
    if (text.includes("\\") || /[\u0000-\u001f\u007f]/.test(text)) return null;
    if (/^\/[^/?#]*:/.test(text)) return null;
  }
  try {
    const url = new URL(value, "https://crm.invalid");
    if (url.origin !== "https://crm.invalid") return null;
    if (url.pathname.startsWith("//")) return null;
  } catch {
    return null;
  }
  return value;
}

export function loginUrl(
  reason: "ended" | "idle" = "ended",
  where: Pick<Location, "pathname" | "search" | "hash"> = location,
) {
  const path = where.pathname || "/";
  const next = safeNext(path + (where.search || "") + (where.hash || ""));
  const query = new URLSearchParams({ reason });
  if (next && next !== "/" && !path.startsWith("/login"))
    query.set("next", next);
  return "/login?" + query.toString();
}

let leaving = false;
export function sessionEnded(
  navigate: (url: string) => void = (url) => location.assign(url),
) {
  if (leaving) return;
  leaving = true;
  window.dispatchEvent(new CustomEvent("crm:session-ended"));
  navigate(loginUrl("ended"));
}
export function resetSessionEnded() {
  leaving = false;
}

let me: Promise<{ id: string; role: string } | null> | null = null;
export function currentUser(): Promise<{ id: string; role: string } | null> {
  me ??= fetch("/api/auth/me", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) return null;
      const data: unknown = await r.json();
      return data &&
        typeof data === "object" &&
        "id" in data &&
        typeof data.id === "string" &&
        "role" in data &&
        typeof data.role === "string"
        ? { id: data.id, role: data.role }
        : null;
    })
    .catch(() => null);
  return me;
}
export function forgetUser() {
  me = null;
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
export const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export interface Draft<T = unknown> {
  before: T | undefined;
  after: T;
}
const PREFIX = "crm.draft.";
const prefix = (user: string, module: string) =>
  PREFIX + encodeURIComponent(user) + "." + module + ".";
function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function keepDrafts(
  user: string,
  module: string,
  drafts: Record<string, Draft>,
) {
  const store = storage();
  if (!store) return false;
  try {
    for (const [id, draft] of Object.entries(drafts))
      store.setItem(
        prefix(user, module) + encodeURIComponent(id),
        JSON.stringify(draft),
      );
    return true;
  } catch {
    return false;
  }
}

export function readDrafts(
  user: string,
  module: string,
): Record<string, Draft> {
  const store = storage(),
    out: Record<string, Draft> = {};
  if (!store) return out;
  const start = prefix(user, module);
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(start)) continue;
    try {
      const value: unknown = JSON.parse(store.getItem(key) || "null");
      if (value && typeof value === "object" && "after" in value)
        out[decodeURIComponent(key.slice(start.length))] = value as Draft;
    } catch {
      /* A damaged entry is dropped below. */
    }
  }
  return out;
}

export function clearDrafts(user?: string, module?: string) {
  const store = storage();
  if (!store) return;
  const start = user && module ? prefix(user, module) : PREFIX;
  for (let i = store.length - 1; i >= 0; i--) {
    const key = store.key(i);
    if (key?.startsWith(start)) store.removeItem(key);
  }
}

// Changed records between what was loaded and what is about to be saved.
export function changedRecords<T extends { id: string }>(
  before: T[],
  after: T[],
): Record<string, Draft<T>> {
  const old = new Map(before.map((c) => [c.id, c]));
  const out: Record<string, Draft<T>> = {};
  for (const c of after)
    if (!same(old.get(c.id), c))
      out[c.id] = { before: old.get(c.id), after: c };
  return out;
}

// Put drafts back on the newest saved copy. A record that changed elsewhere meanwhile is not
// overwritten; it is reported so the person can redo that change.
export function replay<T extends { id: string }>(
  latest: T[],
  drafts: Record<string, Draft<T>>,
): { records: T[]; applied: string[]; conflicts: string[] } {
  const records = latest.map((c) => structuredClone(c)),
    applied: string[] = [],
    conflicts: string[] = [];
  for (const [id, draft] of Object.entries(drafts)) {
    const index = records.findIndex((c) => c.id === id);
    const now = index < 0 ? undefined : records[index];
    if (same(now, draft.after)) continue;
    if (!same(now, draft.before)) {
      conflicts.push(id);
      continue;
    }
    if (index < 0) records.push(structuredClone(draft.after));
    else records[index] = structuredClone(draft.after);
    applied.push(id);
  }
  return { records, applied, conflicts };
}
