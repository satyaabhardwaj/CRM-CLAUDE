import { useCallback, useEffect, useRef, useState } from "react";
import { adapt, STAGES, type Request } from "./model";
interface VisitLite {
  id: string;
  type: string;
  status: string;
  date?: string;
  note?: string;
  revisit?: boolean;
  assigneeName?: string;
  createdAt?: string;
  doneAt?: string;
}
interface BoardClientLite {
  id: string;
  name?: string;
  pid?: string;
  city?: string;
  state?: string;
  owner?: string;
  product?: string;
  siteAddress?: string;
  visits?: VisitLite[];
}
const STAGE_OF: Record<string, (typeof STAGES)[number]> = {
  first: "First Measurement",
  eptMarking: "EPT Marking",
  eptVerification: "EPT Verification",
  pdi: "PDI",
};
// One CRM visit in the shape the Home, Requests, Areas and Reports pages already use.
export function fromVisit(c: BoardClientLite, v: VisitLite) {
  const scheduled = ["assigned", "accepted"].includes(v.status) && !!v.date;
  return {
    id: c.id + "|" + v.id,
    client: c.name || "",
    order: c.pid || "",
    stage: STAGE_OF[v.type] || "First Measurement",
    status:
      v.status === "done"
        ? "Completed"
        : scheduled
          ? "Scheduled"
          : "To Schedule",
    record_id: c.id,
    city: c.city || "",
    state: c.state || "",
    zone: "",
    owner: c.owner || "",
    assigned_person: v.assigneeName || "",
    product: c.product || "",
    address: c.siteAddress || "",
    date: v.date || "",
    expected_date: "",
    requested_at: v.createdAt || "",
    completed_date: v.doneAt || "",
    modified_at: v.doneAt || v.createdAt || "",
    received_at: v.createdAt || "",
    crm_stage: v.status,
    request_bucket: v.revisit ? "Revisit" : "First visit",
    schedule_note: v.note || "",
    coordinates: null,
  };
}
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
      // Zoho is being switched off (Manish, 23 Oct 2026): these pages now read the CRM's own visits.
      const response = await fetch("/api/measurement/board", {
        cache: "no-store",
        signal,
      });
      if (response.status === 401) {
        location.assign("/login");
        return;
      }
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "You do not have permission to view Measurement."
            : "Visits could not be loaded. Please retry.",
        );
      const data = (await response.json()) as {
        clients?: BoardClientLite[];
      };
      if (!data || !Array.isArray(data.clients))
        throw new Error("Visits returned an invalid response.");
      const records = data.clients.flatMap((c) =>
        (c.visits || [])
          .filter((v) => v.status !== "cancelled")
          .map((v) => adapt(fromVisit(c, v))),
      );
      setState({
        records,
        loading: false,
        error: "",
        syncedAt: new Date().toISOString(),
        orders: data.clients.length,
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
