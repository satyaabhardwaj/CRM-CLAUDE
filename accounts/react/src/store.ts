import { useCallback, useEffect, useRef, useState } from "react";
import { normalize, L, type Store, type Client } from "./model";
import {
  SessionEnded,
  sessionEnded,
  keepDrafts,
  readDrafts,
  clearDrafts,
  replay,
  type Draft,
} from "../../../shared/session";
const MODULE = "accounts";
// A save cut off by the end of the session carries the changed client so it can be kept.
export class SessionEndedWithDraft extends SessionEnded {
  constructor(
    readonly id: string,
    readonly draft: Draft<Client>,
  ) {
    super();
  }
}
export type Mutate = (client: Client) => void;
export async function readStore(): Promise<Store> {
  const r = await fetch("/api/store", {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 401) throw new SessionEnded();
  if (!r.ok)
    throw Error(
      r.status === 403
        ? "You do not have access to Accounts."
        : "Saved data could not be loaded. Please retry.",
    );
  const data: unknown = await r.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("clients" in data) ||
    !Array.isArray(data.clients) ||
    !("rev" in data) ||
    typeof data.rev !== "number"
  )
    throw Error("Saved data has an invalid format.");
  return data as Store;
}
export async function transact(
  id: string,
  operationId: string,
  mutate: Mutate,
): Promise<Store> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await readStore();
    const index = latest.clients.findIndex((c) => c.id === id);
    if (index < 0) throw Error("Client no longer exists.");
    if (latest.clients[index].accountsOperations?.includes(operationId))
      return latest;
    const c = L().ensure(structuredClone(latest.clients[index]));
    mutate(c);
    c.accountsOperations = [...(c.accountsOperations || []), operationId];
    const next = {
      ...latest,
      clients: latest.clients.map((old, i) => (i === index ? c : old)),
    };
    let response: Response;
    try {
      response = await fetch("/api/store", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw Error(
        "Save could not be confirmed. Keep this form open and retry; the same payment will not be added twice.",
      );
    }
    if (response.status === 409) continue;
    if (response.status === 401)
      throw new SessionEndedWithDraft(id, {
        before: latest.clients[index],
        after: c,
      });
    if (!response.ok)
      throw Error(
        response.status === 403
          ? "This account cannot save Accounts changes."
          : "Save failed. Your form is retained; please retry.",
      );
    const result = await response.json();
    return {
      ...next,
      rev: typeof result.rev === "number" ? result.rev : next.rev + 1,
    };
  }
  throw Error(
    "The record is changing in another window. Please retry after reviewing it.",
  );
}
function fromScreen(
  saved: Store | null,
  id: string,
  operationId: string,
  mutate: Mutate,
): Draft<Client> | null {
  const before = saved?.clients.find((c) => c.id === id);
  if (!before) return null;
  try {
    const after = L().ensure(structuredClone(before));
    mutate(after);
    after.accountsOperations = [
      ...(after.accountsOperations || []),
      operationId,
    ];
    return { before, after };
  } catch {
    return null;
  }
}
export function useStore(paused: boolean) {
  const [data, setData] = useState<Store | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [writable, setWritable] = useState(false),
    [notice, setNotice] = useState("");
  const busy = useRef(false),
    pause = useRef(paused),
    generation = useRef(0),
    shown = useRef<number | null>(null),
    user = useRef(""),
    raw = useRef<Store | null>(null);
  pause.current = paused;
  const refresh = useCallback(async () => {
    const version = generation.current;
    try {
      const value = await readStore();
      raw.current = value;
      if (!busy.current && version === generation.current) {
        // Same revision as on screen: nothing changed, so nothing re-renders.
        if (shown.current !== value.rev) {
          shown.current = value.rev;
          setData(normalize(value));
        }
        setError("");
      }
    } catch (e) {
      if (e instanceof SessionEnded) return sessionEnded();
      if (!busy.current)
        setError(e instanceof Error ? e.message : "Unable to refresh.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    let stopped = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        const me = r.ok ? await r.json() : null;
        user.current = typeof me?.id === "string" ? me.id : "";
        const can =
          r.status === 404 || r.status === 405 || me?.role === "admin";
        if (stopped) return;
        setWritable(can);
        if (can && user.current) void restore(user.current);
      })
      .catch(() => {});
    const timer = setInterval(() => {
      if (
        !busy.current &&
        !pause.current &&
        !document.activeElement?.matches("input,select,textarea") &&
        document.visibilityState === "visible"
      )
        void refresh();
    }, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [refresh]);
  const save = async (id: string, operationId: string, mutate: Mutate) => {
    if (busy.current) return null;
    busy.current = true;
    generation.current++;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await transact(id, operationId, mutate);
      shown.current = result.rev;
      setData(normalize(result));
      setNotice("Saved successfully.");
      return result.clients.find((c) => c.id === id)!;
    } catch (e) {
      if (e instanceof SessionEnded && user.current) {
        // The session may end on the first read, before the change was applied: rebuild it
        // from the saved copy on screen so it is not lost.
        const draft =
          e instanceof SessionEndedWithDraft
            ? e.draft
            : fromScreen(raw.current, id, operationId, mutate);
        if (draft) keepDrafts(user.current, MODULE, { [id]: draft });
      }
      if (e instanceof SessionEnded) sessionEnded();
      setError(e instanceof Error ? e.message : "Save failed.");
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  // After signing in again: save the kept changes once on the newest copy.
  const restore = async (who: string) => {
    const drafts = readDrafts(who, MODULE) as Record<string, Draft<Client>>;
    if (!Object.keys(drafts).length || busy.current) return;
    clearDrafts(who, MODULE);
    busy.current = true;
    setSaving(true);
    try {
      const latest = await readStore();
      const result = replay(latest.clients, drafts);
      const names = result.conflicts.map(
        (id) => latest.clients.find((c) => c.id === id)?.name || id,
      );
      if (result.applied.length) {
        const next = { ...latest, clients: result.records };
        const response = await fetch("/api/store", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok)
          throw Error(
            "Your unsaved Accounts change could not be saved after signing in. Please redo it.",
          );
        const out = await response.json();
        shown.current = typeof out.rev === "number" ? out.rev : null;
        setData(normalize({ ...next, rev: out.rev }));
        setNotice("Your unsaved change was saved after signing in.");
      }
      if (names.length)
        setError(
          "Not reapplied because the record changed meanwhile: " +
            names.join(", ") +
            ". Please redo it.",
        );
    } catch (e) {
      if (e instanceof SessionEnded) sessionEnded();
      else setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return { data, error, saving, writable, notice, refresh, save };
}
export type Save = (
  id: string,
  operationId: string,
  mutate: Mutate,
) => Promise<Client | null>;
