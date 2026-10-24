import { Sidebar } from "../../../backend/react/src/Sidebar";
import {
  AppHeader,
  BellPlaceholder,
  Rail as RailPanel,
  SaveStateContext,
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
import { DesignStore } from "./data";
import type { Context, WindowKind } from "./types";
import { clients, rules } from "./model";
import { pages, seen, tasks, STEP } from "./selectors";
import { Button, Select, Pill } from "./ui";
import { TopFacts } from "./Facts";
import { ClientForm } from "./ClientForm";
import {
  ProposalForm,
  TimelineForm,
  MeasurementForm,
  EptForm,
  AppliancesForm,
  DesignFlowForm,
  PdiForm,
} from "./Forms";
import { Today, Pre, Post } from "./Pages";
import { Summary, Rail, Notifications } from "./Overview";
export const store = new DesignStore();
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
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null,
      dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet design-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      {children}
    </dialog>
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert">
        This Design view could not be shown.{" "}
        <button onClick={() => location.reload()}>Reload Design</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const status = useSyncExternalStore(store.subscribe, store.snapshot),
    [lastField, setLastField] = useState(""),
    [route, setRoute] = useState(location.hash.slice(1)),
    [open, setOpen] = useState<{ kind: WindowKind; id: string } | null>(null),
    [designer, setDesigner] = useState(""),
    [find, setFind] = useState(""),
    [range, setRange] = useState("all"),
    [rail, setRail] = useState(false),
    all = clients(window.Kit.store.data?.clients || []).filter(
      (c) => !["bin", "lost"].includes(c.stage),
    ),
    filtered = seen(all, designer, find, range),
    [tabPart, pagePart] = route.split("/"),
    tab = ["today", "pre", "post"].includes(tabPart) ? tabPart : "today",
    menu = pages(tab, filtered),
    page = menu.some((p) => p.id === pagePart) ? pagePart : menu[0]?.id || "",
    c = open ? all.find((c) => c.id === open.id) : undefined,
    disabled = !status.writable || status.dirty;
  const close = () => setOpen(null),
    go = (tab: string, page = "") => {
      setRail(false);
      history.pushState(null, "", "#" + tab + (page ? "/" + page : ""));
      setRoute(tab + (page ? "/" + page : ""));
      close();
    },
    ctx: Context = {
      all,
      tab,
      page,
      readOnly: disabled,
      update: store.update,
      show: (kind, id) => setOpen({ kind, id }),
      close,
      go,
    };
  useEffect(() => {
    const hash = () => {
      setRoute(location.hash.slice(1));
      setOpen(null);
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("popstate", hash);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("popstate", hash);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
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
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [open]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (store.state.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
    };
  }, []);
  const Forms = {
      client: ClientForm,
      proposal: ProposalForm,
      timeline: TimelineForm,
      measure: MeasurementForm,
      ept: EptForm,
      appliances: AppliancesForm,
      designflow: DesignFlowForm,
      pdi: PdiForm,
    },
    Form = open ? Forms[open.kind] : ClientForm;
  const statusUI = (inside = false) =>
    (!status.ready ||
      status.error ||
      status.dirty ||
      !status.writable ||
      status.saved) && (
      <div
        className={
          "design-status" +
          (status.saved && !status.saving && !status.error && status.writable
            ? " is-saved"
            : "")
        }
        role={status.error ? "alert" : "status"}
      >
        {status.error ||
          (status.saving
            ? "Saving changes…"
            : !status.ready
              ? "Loading Design…"
              : !status.writable
                ? "Read-only access. Changes require an administrator."
                : status.saved
                  ? "Changes saved."
                  : "")}
        {status.error && (
          <Button
            disabled={status.saving}
            onClick={status.dirty ? store.retry : () => void store.load()}
          >
            {status.dirty ? "Retry saving" : "Retry loading"}
          </Button>
        )}
        {status.dirty && !status.saving && !inside && (
          <Button
            onClick={() => {
              if (confirm("Discard unsaved changes and reload saved data?")) {
                close();
                void store.discard();
              }
            }}
          >
            Discard unsaved change
          </Button>
        )}
      </div>
    );
  const designerOptions: (readonly [string, string])[] = [
    ["", "Everyone · head " + window.People.designHead],
    ...window.People.designers.map((d) => [d, "Designer · " + d] as const),
  ];
  const designRanges: (readonly [string, string])[] = [
    ["all", "All time"],
    ["today", "Today"],
    ["week", "This week"],
    ["month", "This month"],
  ];
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
          current="design"
          navigation="Design navigation"
          search={
            <input
              aria-label="Find a client"
              type="search"
              placeholder="Find a client"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          }
          actions={
            <>
              {status.ready ? (
                <Notifications all={all} ctx={ctx} />
              ) : (
                <BellPlaceholder />
              )}
            </>
          }
        />
        {statusUI()}
        {!status.ready && !status.error && (
          <>
            <div className="stagebar" aria-hidden="true" />
            <Skeleton sidebar label="Loading Design" />
          </>
        )}
        {status.ready && (
          <>
            <div className="stagebar" role="tablist" aria-label="Design stages">
              {[
                ["today", "My tasks today", tasks(filtered).length],
                [
                  "pre",
                  "Pre-design",
                  filtered.filter(
                    (c) =>
                      ["design", "token", "booked"].includes(c.stage) &&
                      !rules().handed(c),
                  ).length,
                ],
                ["post", "Post-design", filtered.filter(rules().handed).length],
              ].map(([id, label, count]) => (
                <button
                  type="button"
                  role="tab"
                  key={id}
                  className={id === tab ? "on" : ""}
                  aria-selected={id === tab}
                  onClick={() => go(String(id))}
                >
                  <span>{label}</span>
                  <b>{count}</b>
                </button>
              ))}
              {/* Staff and date filters sit at the end of the tab row (Manish, 23 Oct 2026): no extra row. */}
              <div className="stagebar-tools" aria-label="Design filters">
                <select
                  aria-label="Viewing (staff filter)"
                  title="Viewing (staff filter)"
                  value={designer}
                  onChange={(e) => setDesigner(e.target.value)}
                >
                  {designerOptions.map(([v, text]) => (
                    <option key={v} value={v}>
                      {text}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Dates"
                  title="Dates"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                >
                  {designRanges.map(([v, text]) => (
                    <option key={v} value={v}>
                      {text}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="body">
              {/* The sidebar stays on every tab so the content never jumps sideways; on
                My tasks it lists both portals' pages. */}
              <Sidebar
                id="design"
                label="Design navigation"
                active={tab === "today" ? "" : page}
                items={(tab === "today" ? ["pre", "post"] : [tab]).flatMap(
                  (portal) =>
                    pages(portal, filtered).map((p) => ({
                      id: p.id,
                      label: p.title,
                      description: p.summary,
                      count: p.count,
                      group: portal === "pre" ? "Pre-design" : "Post-design",
                    })),
                )}
                onNavigate={(id) =>
                  go(
                    tab !== "today"
                      ? tab
                      : pages("pre", filtered).some((p) => p.id === id)
                        ? "pre"
                        : "post",
                    id,
                  )
                }
              />
              <main className="main">
                <Summary all={filtered} ctx={ctx} />
                {tab !== "today" && (
                  <button
                    className="btn design-rail-toggle"
                    aria-expanded={rail}
                    onClick={() => setRail(!rail)}
                  >
                    {rail ? "Hide today" : "Also today"}
                  </button>
                )}
                {tab === "today" ? (
                  <Today all={filtered} ctx={ctx} />
                ) : tab === "pre" ? (
                  <Pre all={filtered} ctx={ctx} />
                ) : (
                  <Post all={filtered} ctx={ctx} />
                )}
              </main>
              {tab !== "today" && (
                <RailPanel open={rail} onClose={() => setRail(false)}>
                  <Rail all={filtered} ctx={ctx} />
                </RailPanel>
              )}
            </div>
          </>
        )}
        {c && open && (
          <Modal key={c.id} title={c.name} close={close}>
            <div className="sheet-h">
              <div>
                <div className="flexrow">
                  <h2>{c.name}</h2>
                  <Pill tone="blue">
                    {open.kind === "client"
                      ? rules().handed(c)
                        ? rules().postStage(c)
                        : STEP[c.design.step || "drf"] || c.stage
                      : (
                          {
                            proposal: c.design.proposals.length
                              ? "Revision · V" + (c.design.proposals.length + 1)
                              : "First proposal",
                            timeline: "Timeline",
                            measure:
                              "First site measurement · " +
                              rules().measureState(c).step,
                            ept: "EPT",
                            appliances: "Appliances",
                            designflow: "Design",
                            pdi: rules().flow(c).pdi.approvedAt
                              ? "PDI approved"
                              : "PDI waiting",
                          } as Record<string, string>
                        )[open.kind]}
                  </Pill>
                </div>
                <p className="sub">
                  {c.pid} · {c.cid} · {c.city} · {c.product}
                </p>
              </div>
              <Button tone="small" onClick={close}>
                Close
              </Button>
            </div>
            {status.error && statusUI(true)}
            <div className="sheet-b">
              {!rules().handed(c) && (
                <a
                  className="btn dark kitchen-designer-link"
                  href="https://kitchen-designer-three.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Make your kitchen design
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
                  </svg>
                </a>
              )}
              <TopFacts c={c} />
              <fieldset
                className="design-form"
                disabled={disabled && open.kind !== "client"}
              >
                <Form key={c.id + "-" + open.kind} c={c} ctx={ctx} />
              </fieldset>
            </div>
          </Modal>
        )}
      </SaveStateContext.Provider>
    </Boundary>
  );
}
