import { Sidebar } from "../../../backend/react/src/Sidebar";
import {
  AppHeader,
  BellPlaceholder,
  Rail,
  SaveStateContext,
  ShellIcon,
  Skeleton,
} from "../../../backend/react/src/Shell";
import {
  Component,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SalesStore } from "./data";
import type { Client, Context } from "./types";
import { pointOfContact } from "./Tracker";
import { clients, rules } from "./model";
import { NewOpportunity } from "./NewOpportunity";
import { ClientForm } from "./ClientForm";
import { approvalRows, routes, paymentInfo, steps } from "./Dashboards";
import { Notifications, SidePanel, Summary } from "./Overview";
import { Button, Field, Select } from "./ui";
import { weeklyReport } from "./reports.js";
export const store = new SalesStore();
export function matches(c: Client, search: string) {
  const q = search.trim().toLowerCase();
  return (
    !q ||
    `${c.name} ${c.pid} ${c.city || ""} ${c.phone || ""}`
      .toLowerCase()
      .includes(q)
  );
}
export function dateBounds(
  range: string,
  from: string,
  to: string,
  now = new Date(),
): [string, string] | null {
  const day = window.Kit.ymd;
  if (range === "today") return [day(now), day(now)];
  if (range === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return [day(start), day(now)];
  }
  if (range === "month")
    return [day(new Date(now.getFullYear(), now.getMonth(), 1)), day(now)];
  if (range === "lastMonth")
    return [
      day(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      day(new Date(now.getFullYear(), now.getMonth(), 0)),
    ];
  if (range === "custom") return [from || "0000-01-01", to || "9999-12-31"];
  return null;
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const status = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet sales-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="sales-dialog-close">
        <Button tone="small" onClick={close}>
          Close window
        </Button>
      </div>
      {status.error && (
        <div className="sales-status" role="alert">
          {status.error}
          {status.dirty && (
            <Button disabled={status.saving} onClick={store.retry}>
              Retry saving
            </Button>
          )}
        </div>
      )}
      {children}
    </dialog>
  );
}
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div role="alert" className="sales-status">
        This Sales view could not be shown.{" "}
        <button onClick={() => location.reload()}>Reload Sales</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const status = useSyncExternalStore(store.subscribe, store.snapshot),
    [lastField, setLastField] = useState(""),
    [route, setRoute] = useState(() => location.hash.slice(1)),
    [picked, setPicked] = useState<string | null>(null),
    [creating, setCreating] = useState(false),
    [peek, setPeek] = useState(""),
    [search, setSearch] = useState(""),
    [rail, setRail] = useState(false),
    [who, setWho] = useState("me"),
    [range, setRange] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const open = !!picked || creating,
    me = window.People.list[0],
    below = window.People.list.filter((p) => p.reportsTo === me.id),
    dashboards = routes.filter(
      (d) => d.id !== "team" || me.startedAs === "AVP",
    );
  const close = () => {
    setPicked(null);
    setCreating(false);
    setPeek("");
  };
  useEffect(() => {
    const hash = () => {
      setRoute(location.hash.slice(1));
      close();
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("popstate", hash);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("popstate", hash);
    };
  }, []);
  useEffect(() => {
    const refresh = setInterval(() => {
        if (
          !open &&
          !document.hidden &&
          !document.activeElement?.matches("input,textarea,select")
        )
          void store.poll();
      }, 4000),
      clock = setInterval(() => {
        if (!open) store.redraw();
      }, 60000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, [open]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (store.state.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  const dash = dashboards.find((d) => d.id === route) || dashboards[0],
    everyone = clients(window.Kit.store.data?.clients || []),
    bounds = dateBounds(range, from, to),
    all = everyone.filter((c) => {
      const owner = c.owner || me.id,
        team =
          who === "team"
            ? owner === me.id || below.some((p) => p.id === owner)
            : owner === (who === "me" ? me.id : who),
        date = window.Kit.ymd(new Date(c.receivedAt));
      return team && (!bounds || (date >= bounds[0] && date <= bounds[1]));
    }),
    visible = all.filter(
      (c) => (dash.page || c.stage === dash.id) && matches(c, search),
    ),
    selected = everyone.find((c) => c.id === picked) || null;
  const navigate = (id: string, c?: Client) => {
    history.pushState(null, "", "#" + id);
    setRoute(id);
    setPicked(c?.id || null);
    setCreating(false);
    setPeek("");
    if (c) setSearch("");
  };
  const ctx: Context = {
    readOnly: !status.writable || status.dirty,
    all,
    everyone,
    clients: visible,
    dash: dash.id,
    selected,
    isOpen: !!selected,
    viewing:
      peek || (dash.id === "tracker" ? "tracker" : selected?.stage || dash.id),
    match: (c) => matches(c, search),
    add: (c) => {
      rules().ensure(c);
      everyone.push(c as (typeof everyone)[number]);
    },
    select: (id) => {
      setPicked(id);
      setPeek("");
    },
    peek: setPeek,
    close,
    update: store.update,
    goTo: navigate,
    open: (c) => navigate(c.stage === "post" ? "tracker" : c.stage, c),
  };
  const count = (id: string) =>
    id === "approvals"
      ? approvalRows(all).filter((r) => r.status === "Pending").length
      : all.filter((c) => c.stage === id).length;
  const navSummary = (id: string) => {
    const list = clients(all).filter((c) => c.stage === id),
      L = rules(),
      short = window.Kit.short;
    if (id === "qualified") {
      const open = list.filter((c) => !c.spokeAt);
      return `${open.length} to call · ${open.filter((c) => L.firstCall(c).late).length} past 24h · ${list.filter((c) => c.priority === "High").length} high priority`;
    }
    if (id === "design")
      return `${short(list.reduce((n, c) => n + (Number(c.design.proposals.at(-1)?.amount) || 0), 0))} · ${list.filter((c) => c.design.newProposal).length} just in · ${list.filter((c) => (steps[c.design.step || "drf"] || steps.drf)[2] === "You").length} your move`;
    if (id === "booked")
      return `${short(list.reduce((n, c) => n + L.bookingLeft(c), 0))} to collect · ${short(list.reduce((n, c) => n + L.collected(c), 0))} collected`;
    if (id === "approvals") {
      const rows = approvalRows(all);
      return ["Pending", "Rejected", "Approved"]
        .map(
          (s) =>
            rows.filter((r) => r.status === s).length + " " + s.toLowerCase(),
        )
        .join(" · ");
    }
    if (id === "team") return below.length + " people · change ASM and SM here";
    if (id === "payments") {
      const rows = clients(all)
        .filter(
          (c) => ["token", "booked"].includes(c.stage) && L.atStake(c) > 0,
        )
        .map(paymentInfo);
      return `${short(rows.reduce((n, x) => n + x.amount, 0))} to collect · ${rows.filter((x) => x.when === "overdue").length} overdue`;
    }
    if (id === "tracker") {
      const rows = clients(all).filter((c) =>
        ["token", "booked", "post"].includes(c.stage),
      );
      return `${rows.length} clients · ${rows.filter((c) => pointOfContact(c)[0] !== "You").length} with a designer · ${short(rows.reduce((n, c) => n + L.bookingLeft(c), 0))} due`;
    }
    return id === "incentive" ? "70% and above: ₹50,000 · below: nil" : "";
  };
  const disabled = !status.writable || status.dirty;
  return (
    <Boundary>
      <SaveStateContext.Provider
        value={{
          saving: status.saving,
          saved: status.saved,
          error: status.error,
          last: lastField,
          mark: setLastField,
        }}
      >
        <AppHeader
          current="sales"
          viewOnly={status.ready && !status.writable}
          navigation="Sales navigation"
          search={
            <input
              type="search"
              aria-label="Find a client"
              placeholder="Find a client"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          }
          actions={
            <>
              <button
                type="button"
                className="btn round"
                aria-label="Download the weekly sales report"
                disabled={!status.ready}
                onClick={() => weeklyReport(ctx)}
              >
                <ShellIcon name="download" />
              </button>
              {status.ready ? (
                <Notifications ctx={ctx} writable={!disabled} />
              ) : (
                <BellPlaceholder />
              )}
            </>
          }
          primary={
            <Button
              tone="dark"
              disabled={!status.ready || disabled}
              onClick={() => {
                setCreating(true);
                setPicked(null);
              }}
            >
              New opportunity
            </Button>
          }
        />
        <div className="crm-page-toolbar" aria-label="Sales filters">
          <Select
            label="Viewing (staff filter)"
            value={who}
            placeholder={false}
            options={[
              ["me", "Me · " + me.name + " (" + me.role + ")"],
              ...below.map((p) => [p.id, p.role + " · " + p.name] as const),
              ...(below.length ? [["team", "My whole team"] as const] : []),
            ]}
            onChange={setWho}
          />
          <Select
            label="Dates"
            value={range}
            options={[
              ["all", "All time"],
              ["today", "Today"],
              ["week", "This week"],
              ["month", "This month"],
              ["lastMonth", "Last month"],
              ["custom", "Custom dates"],
            ]}
            placeholder={false}
            onChange={setRange}
          />
          {range === "custom" && (
            <>
              <Field label="From" type="date" value={from} onCommit={setFrom} />
              <Field label="To" type="date" value={to} onCommit={setTo} />
            </>
          )}
          {status.ready && !dash.page && (
            <button
              type="button"
              className="btn sales-rail-toggle toolbar-end"
              aria-expanded={rail}
              onClick={() => setRail(!rail)}
            >
              {rail ? "Hide today" : "Also today"}
            </button>
          )}
        </div>
        {(!status.ready ||
          status.error ||
          status.saving ||
          status.saved ||
          !status.writable) && (
          <div
            className={
              "sales-status" +
              (status.saved &&
              !status.saving &&
              !status.error &&
              status.writable
                ? " is-saved"
                : "")
            }
            role={status.error ? "alert" : "status"}
          >
            {status.error ||
              (status.saving
                ? "Saving changes…"
                : !status.ready
                  ? "Loading Sales…"
                  : status.saved
                    ? "Changes saved."
                    : "")}
            {status.error && (
              <Button
                tone="small"
                disabled={status.saving}
                onClick={status.dirty ? store.retry : () => void store.load()}
              >
                {status.dirty ? "Retry saving" : "Retry loading"}
              </Button>
            )}
            {status.dirty && !status.saving && (
              <Button
                tone="small"
                onClick={() => {
                  if (
                    confirm(
                      "Discard the unsaved local change and reload saved data?",
                    )
                  ) {
                    close();
                    void store.discard();
                  }
                }}
              >
                Discard unsaved change
              </Button>
            )}
          </div>
        )}
        {!status.ready && !status.error && (
          <Skeleton sidebar tiles={6} label="Loading Sales" />
        )}
        {status.ready && (
          <div className="body">
            <Sidebar
              id="sales"
              label="Sales navigation"
              active={dash.id}
              onNavigate={navigate}
              items={dashboards.map((d) => ({
                id: d.id,
                label: d.title,
                description: navSummary(d.id),
                group: d.small
                  ? "Settings"
                  : !d.page || d.flow
                    ? "Pipeline"
                    : "Management",
                count: d.small
                  ? d.id === "architects"
                    ? ((window.Kit.store.data.architects || []) as unknown[])
                        .length
                    : all.filter(
                        (c) => c.binned || (c.binnedCall && c.stage !== "bin"),
                      ).length
                  : !d.page || d.flow
                    ? count(d.id)
                    : undefined,
              }))}
            />
            <main className="main">
              <div className="sales-main">
                {!dash.page && <Summary ctx={ctx} />}
                {["architects", "team", "bin"].includes(dash.id) ? (
                  <fieldset
                    className="sales-form sales-page-form"
                    disabled={disabled}
                  >
                    <dash.Component key={dash.id} ctx={ctx} />
                  </fieldset>
                ) : (
                  <dash.Component key={dash.id} ctx={ctx} />
                )}
              </div>
            </main>
            {!dash.page && (
              <Rail open={rail} onClose={() => setRail(false)}>
                <SidePanel ctx={ctx} />
              </Rail>
            )}
          </div>
        )}
        {status.ready && creating && (
          <Modal title="New opportunity" close={close}>
            <NewOpportunity ctx={ctx} disabled={disabled} />
          </Modal>
        )}
        {status.ready && !creating && selected && (
          <Modal key={selected.id} title={selected.name} close={close}>
            <fieldset className="sales-form" disabled={disabled}>
              <ClientForm c={selected} ctx={ctx} />
            </fieldset>
          </Modal>
        )}
      </SaveStateContext.Provider>
    </Boundary>
  );
}
