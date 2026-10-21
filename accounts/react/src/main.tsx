import { HeaderSession } from "../../../backend/react/src/Auth";
import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  L,
  STAGES,
  hasOrder,
  inPlay,
  line,
  bankOnly,
  type Client,
} from "./model";
import { useStore } from "./store";
import { Summary, Clients, Approvals, Booking, Stage, Master } from "./pages";
import { Daily, Details } from "./payments";
import { Notifications } from "./Notifications";
import "./style.css";
const tabs = [
  ["summary", "Summary"],
  ["clients", "Clients"],
  ["daily", "Daily payments"],
  ["approvals", "Approvals"],
  ...STAGES.map((s) => s.slice(0, 2)),
  ["master", "Master data"],
];
function currentTab() {
  const tab = location.hash.slice(1).split("/")[0];
  return tabs.some((t) => t[0] === tab) && !(bankOnly() && tab === "master")
    ? tab
    : "summary";
}
function App() {
  const [tab, setTab] = useState(currentTab),
    [opened, setOpened] = useState<{
      id: string;
      kind: "expected" | "booking" | "payment";
      at?: string;
    } | null>(null);
  const store = useStore(!!opened);
  useEffect(() => {
    const change = () => {
      setTab(currentTab());
      setOpened(null);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const open = (
    client: Client,
    kind: "expected" | "booking" | "payment" = "expected",
    at?: string,
  ) => setOpened({ id: client.id, kind, at });
  const clients = store.data?.clients || [],
    selected = clients.find((c) => c.id === opened?.id);
  const counts: Record<string, number> = {
    clients: clients.filter(hasOrder).length,
    approvals: L().GATES.reduce(
      (n, [key]) =>
        n +
        clients.filter(hasOrder).filter((c) => L().gate(c, key).ready).length,
      0,
    ),
    booking: clients.filter(
      (c) => ["token", "booked"].includes(c.stage) && L().bookingLeft(c) > 0,
    ).length,
  };
  STAGES.filter((s) => s[0] !== "booking").forEach((s) => {
    counts[s[0]] = clients.filter(
      (c) => inPlay(c) && c.order.products.length && line(c, s[2])?.now,
    ).length;
  });
  return (
    <>
      <header className="top">
        <HeaderSession />
        <div className="flexrow">
          <div className="brand">
            MAGPPIE <span>Accounts</span>
          </div>
          <nav className="depts" aria-label="Departments">
            {[
              ["sales", "Sales"],
              ["design", "Design"],
              ["measurement", "Measurement"],
              ["accounts", "Accounts"],
              ["management", "Tavneet"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={"/" + id + "/"}
                className={id === "accounts" ? "on" : ""}
                aria-current={id === "accounts" ? "page" : undefined}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
        {store.data && (
          <Notifications
            data={store.data}
            writable={store.writable}
            refresh={store.refresh}
          />
        )}
      </header>
      <nav className="stagebar" aria-label="Accounts stages">
        {tabs
          .filter(([id]) => !bankOnly() || id !== "master")
          .map(([id, label]) => (
            <button
              key={id}
              className={id === tab ? "on" : ""}
              aria-current={id === tab ? "page" : undefined}
              onClick={() => {
                location.hash = id;
                setTab(id);
                setOpened(null);
              }}
              disabled={store.saving}
            >
              {label}
              {store.data && counts[id] !== undefined && <b>{counts[id]}</b>}
            </button>
          ))}
      </nav>
      <main className="body a-main">
        <div className="main">
          {store.error && (
            <div role="alert" className="a-error">
              {store.error}{" "}
              <button
                className="btn small"
                disabled={store.saving}
                onClick={() => void store.refresh()}
              >
                Refresh data
              </button>
            </div>
          )}
          {store.notice && (
            <p className="a-notice" role="status">
              {store.notice}
            </p>
          )}
          {!store.data ? (
            <p role="status">
              {store.error
                ? "Accounts data is unavailable."
                : "Loading saved Accounts data…"}
            </p>
          ) : (
            <>
              {!store.writable && (
                <p className="hint">
                  Read-only access. Payment and approval actions require an
                  administrator.
                </p>
              )}
              {tab === "summary" && <Summary clients={clients} />}
              {tab === "clients" && <Clients clients={clients} open={open} />}
              {tab === "daily" && (
                <Daily
                  clients={clients}
                  open={open}
                  save={store.save}
                  saving={store.saving}
                  writable={store.writable}
                />
              )}
              {tab === "approvals" && (
                <Approvals clients={clients} open={open} />
              )}
              {tab === "booking" && <Booking clients={clients} open={open} />}
              {STAGES.some((s) => s[0] === tab && tab !== "booking") && (
                <Stage clients={clients} tab={tab} open={open} />
              )}
              {tab === "master" && !bankOnly() && <Master clients={clients} />}
            </>
          )}
        </div>
      </main>
      {selected && opened && (
        <Details
          key={selected.id + opened.kind + (opened.at || "")}
          client={selected}
          kind={opened.kind}
          at={opened.at}
          save={store.save}
          saving={store.saving}
          writable={store.writable}
          error={store.error}
          onClose={() => setOpened(null)}
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
      <section className="card a-error" role="alert">
        <h1>Accounts could not be displayed</h1>
        <p>
          No changes have been saved by this error. Reload to review the latest
          data.
        </p>
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
