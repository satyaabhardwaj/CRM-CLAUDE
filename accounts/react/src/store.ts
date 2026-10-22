import { useCallback, useEffect, useRef, useState } from "react";
import { normalize, L, type Store, type Client } from "./model";
export type Mutate = (client: Client) => void;
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
    if (response.status === 401) {
      location.assign("/login");
      throw Error("Please sign in again.");
    }
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
export function useStore(paused: boolean) {
  const [data, setData] = useState<Store | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [writable, setWritable] = useState(false),
    [notice, setNotice] = useState("");
  const busy = useRef(false),
    pause = useRef(paused),
    generation = useRef(0),
    shown = useRef<number | null>(null);
  pause.current = paused;
  const refresh = useCallback(async () => {
    const version = generation.current;
    try {
      const value = await readStore();
      if (!busy.current && version === generation.current) {
        // Same revision as on screen: nothing changed, so nothing re-renders.
        if (shown.current !== value.rev) {
          shown.current = value.rev;
          setData(normalize(value));
        }
        setError("");
      }
    } catch (e) {
      if (!busy.current)
        setError(e instanceof Error ? e.message : "Unable to refresh.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    let stopped = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!stopped)
          setWritable(
            r.status === 404 ||
              r.status === 405 ||
              (r.ok && (await r.json()).role === "admin"),
          );
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
      setError(e instanceof Error ? e.message : "Save failed.");
      return null;
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
