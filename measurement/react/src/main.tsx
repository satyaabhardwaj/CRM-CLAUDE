import { Sidebar } from "../../../backend/react/src/Sidebar";
import { AppHeader } from "../../../backend/react/src/Shell";
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  STAGES,
  count,
  route,
  select,
  slug,
  timestamp,
  type Filters,
  type Page,
  type Request,
} from "./model";
import { useRequests } from "./api";
import { Details, Stats } from "./components";
import { FilterDialog } from "./Filters";
import { Overview, Requests, Reports } from "./pages";
import { Notifications } from "./Notifications";
import "./style.css";
const Areas = lazy(() => import("./Areas"));
const PAGES: [Page, string][] = [
  ["overview", "Home"],
  ["requests", "Requests"],
  ["areas", "Areas"],
  ["reports", "Reports"],
];
function App() {
  const [place, setPlace] = useState(() => route()),
    [filters, setFilters] = useState<Filters>(() =>
      window.Measurements.defaults(),
    ),
    [filterOpen, setFilterOpen] = useState(false),
    [detail, setDetail] = useState<Request | null>(null),
    [focusId, setFocusId] = useState("");
  const live = useRequests(filterOpen || !!detail);
  useEffect(() => {
    const change = () => {
      setPlace(route());
      setDetail(null);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const go = (tab: string, page: Page = "overview") => {
    location.hash = tab + "/" + page;
    setPlace({ tab, page });
    setDetail(null);
  };
  const open = useCallback((r: Request) => setDetail(r), []);
  const records = useMemo(
    () => select(live.records, filters, place.tab),
    [live.records, filters, place.tab],
  );
  const status = (value: string) => {
    setFilters((f) => ({ ...f, status: value }));
    go(place.tab, "requests");
  };
  const summary = [
    place.tab === "all"
      ? filters.stages.join(", ")
      : STAGES.find((s) => slug(s) === place.tab),
    filters.status,
    filters.search,
    filters.city,
    filters.region,
    filters.owner,
    filters.product,
    filters.zone,
    filters.dateRange,
  ]
    .filter(Boolean)
    .join(" · ");
  const ready = !live.loading && !live.error && !!live.syncedAt;
  return (
    <>
      <AppHeader
        current="measurement"
        navigation="Measurement navigation"
        actions={<Notifications />}
      />
      <nav className="stagebar" aria-label="Measurement stages">
        {["all", ...STAGES.map(slug)].map((id, i) => (
          <button
            key={id}
            className={id === place.tab ? "on" : ""}
            aria-pressed={id === place.tab}
            onClick={() => go(id)}
          >
            {i === 0 ? "All four" : STAGES[i - 1]}
            {ready && (
              <b>
                {
                  count(
                    i === 0
                      ? live.records
                      : live.records.filter((r) => slug(r.stage) === id),
                  ).Open
                }
              </b>
            )}
          </button>
        ))}
      </nav>
      <div className="body">
        <Sidebar
          id="measurement"
          label="Measurement navigation"
          active={place.page}
          items={PAGES.map(([id, label]) => ({
            id,
            label,
            group: "Measurement",
          }))}
          onNavigate={(id) => go(place.tab, id as Page)}
        />
        <main className="main">
          <div className="m-toolbar" role="status">
            <b>Live Zoho CRM</b>
            <span className="sub">
              {live.loading
                ? "Refreshing Orders…"
                : live.syncedAt
                  ? `${live.orders} orders scanned · synced ${timestamp(live.syncedAt)}`
                  : "Connecting…"}
            </span>
            <button
              className="btn small"
              disabled={live.loading}
              onClick={() => void live.refresh(true)}
            >
              {live.loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {!ready ? (
            <section
              className="card m-status"
              role={live.error ? "alert" : "status"}
            >
              <h2>
                {live.error
                  ? "Measurement data could not be loaded"
                  : "Loading live measurement requests"}
              </h2>
              <p>
                {live.error ||
                  "Reading all Orders from Zoho. The first sync can take a minute."}
              </p>
              {live.syncedAt && (
                <p className="sub">
                  Last successful sync: {timestamp(live.syncedAt)}. Counts are
                  hidden until the connection recovers.
                </p>
              )}
              {live.error && (
                <button
                  className="btn dark"
                  onClick={() => void live.refresh(true)}
                >
                  Try again
                </button>
              )}
            </section>
          ) : (
            <>
              {place.page !== "overview" && (
                <div className="m-toolbar">
                  <input
                    aria-label="Search measurement requests"
                    placeholder="Search requests"
                    value={filters.search}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, search: e.target.value }))
                    }
                  />
                  <button className="btn" onClick={() => setFilterOpen(true)}>
                    Filters
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setFilters(window.Measurements.defaults());
                      go("all", place.page);
                    }}
                  >
                    Clear all
                  </button>
                  <span className="sub">
                    {records.length} requests · {summary}
                  </span>
                </div>
              )}
              <Stats records={records} onStatus={status} />
              {place.page === "overview" && (
                <Overview
                  records={records}
                  onOpen={open}
                  onStage={(s) => go(s, "requests")}
                  onStatus={status}
                />
              )}
              {place.page === "requests" && (
                <Requests records={records} onOpen={open} />
              )}
              {place.page === "reports" && (
                <Reports
                  records={records}
                  summary={summary}
                  onStage={(s) => go(s, "requests")}
                />
              )}
              {place.page === "areas" && (
                <Suspense fallback={<p role="status">Loading site map…</p>}>
                  <Areas records={records} onOpen={open} focusId={focusId} />
                </Suspense>
              )}
            </>
          )}
        </main>
      </div>
      {filterOpen && (
        <FilterDialog
          records={live.records}
          value={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(f) => {
            setFilters(f);
            setFilterOpen(false);
            go("all", place.page);
          }}
        />
      )}
      {detail && (
        <Details
          record={detail}
          onClose={() => setDetail(null)}
          onMap={(r) => {
            setFocusId(r.id);
            go(place.tab, "areas");
          }}
        />
      )}
    </>
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="card m-status" role="alert">
        <h1>Measurement could not be displayed</h1>
        <p>Please reload and try again.</p>
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("app")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
