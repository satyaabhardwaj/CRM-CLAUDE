import { useCallback, useEffect, useRef, useState } from "react";
import { adapt, type Request } from "./model";
export function useRequests(paused: boolean) {
  const [state, setState] = useState({
    records: [] as Request[],
    loading: true,
    error: "",
    syncedAt: "",
    orders: 0,
  });
  const running = useRef(false),
    controller = useRef<AbortController | null>(null),
    pause = useRef(paused);
  pause.current = paused;
  const refresh = useCallback(async (force = false) => {
    if (running.current) return;
    running.current = true;
    const active = new AbortController();
    controller.current = active;
    const signal = active.signal;
    const timeout = setTimeout(() => active.abort(), 120000);
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const response = await fetch(
        "/api/measurement/requests" + (force ? "?refresh=1" : ""),
        { cache: "no-store", signal },
      );
      if (response.status === 401) {
        location.assign("/login");
        return;
      }
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "You do not have permission to view Measurement."
            : "The live connection is unavailable. Please retry.",
        );
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("requests" in data) ||
        !Array.isArray(data.requests) ||
        !("synced_at" in data) ||
        typeof data.synced_at !== "string" ||
        !Number.isFinite(Date.parse(data.synced_at)) ||
        !("orders_scanned" in data) ||
        typeof data.orders_scanned !== "number" ||
        !Number.isFinite(data.orders_scanned)
      )
        throw new Error("The live connection returned an invalid response.");
      const payload = data as {
        requests: unknown[];
        synced_at?: string;
        orders_scanned?: number;
      };
      setState({
        records: payload.requests.map((r) => adapt(r)),
        loading: false,
        error: "",
        syncedAt: payload.synced_at || "",
        orders: payload.orders_scanned || 0,
      });
    } catch (error) {
      if (signal.aborted)
        setState((s) => ({
          ...s,
          loading: false,
          error: "The request timed out. Please retry.",
        }));
      else
        setState((s) => ({
          ...s,
          loading: false,
          error:
            error instanceof Error ? error.message : "Unable to load requests.",
        }));
    } finally {
      clearTimeout(timeout);
      running.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (
        !pause.current &&
        document.visibilityState === "visible" &&
        !document.activeElement?.matches("input,select,textarea,button")
      )
        void refresh();
    }, 300000);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
    };
  }, [refresh]);
  return { ...state, refresh };
}
