import { Sidebar } from "../../../backend/react/src/Sidebar";
import { HeaderSession } from "../../../backend/react/src/Auth";
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
      <div className="design-status" role={status.error ? "alert" : "status"}>
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
  return (
    <Boundary>
      <header className="top">
        <HeaderSession />
        <div className="flexrow">
          <div className="brand">
            MAGPPIE <span>Design</span>
          </div>
          <nav className="depts" aria-label="Departments">
            {[
              ["sales", "Sales"],
              ["design", "Design"],
              ["measurement", "Measurement"],
              ["accounts", "Accounts"],
              ["management", window.Kit.headName()],
            ].map(([id, label]) => (
              <a
                key={id}
                className={id === "design" ? "on" : ""}
                href={"/" + id + "/"}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flexrow design-tools">
          <input
            aria-label="Find a client"
            type="search"
            placeholder="Find a client"
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          {status.ready && <Notifications all={all} ctx={ctx} />}
        </div>
      </header>
      <div className="crm-page-toolbar" aria-label="Design filters">
        <Select
          label="Viewing"
          value={designer}
          options={[
            ["", "Everyone · head " + window.People.designHead],
            ...window.People.designers.map(
              (d) => [d, "Designer · " + d] as const,
            ),
          ]}
          placeholder={false}
          onChange={setDesigner}
        />
        <Select
          label="Dates"
          value={range}
          options={[
            ["all", "All time"],
            ["today", "Today"],
            ["week", "This week"],
            ["month", "This month"],
          ]}
          placeholder={false}
          onChange={setRange}
        />
      </div>
      {statusUI()}
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
          </div>
          <div className="body">
            {menu.length > 0 && (
              <Sidebar
                id="design"
                label="Design navigation"
                active={page}
                items={menu.map((p) => ({
                  id: p.id,
                  label: p.title,
                  description: p.summary,
                  count: p.count,
                  group: tab === "pre" ? "Pre-design" : "Post-design",
                }))}
                onNavigate={(id) => go(tab, id)}
              />
            )}
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
              <aside
                className={"rail" + (rail ? " design-rail-open" : "")}
                aria-label="Also today"
              >
                <Rail all={filtered} ctx={ctx} />
              </aside>
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
    </Boundary>
  );
}
