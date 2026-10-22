import { AppHeader, Skeleton } from "../../../backend/react/src/Shell";
import {
  Component,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ManagementStore } from "./data";
import type { Open, Tab, Range } from "./types";
import { forPerson, liveClients } from "./model";
import { Overview, PeoplePage, ClientsPage } from "./Pages";
import { Analysis } from "./Analysis";
import { ClientDetail, PersonDetail } from "./Details";
import { Select } from "./ui";
export const store = new ManagementStore();
const tabs: readonly (readonly [Tab, string])[] = [
  ["overview", "Overview"],
  ["people", "Sales person wise"],
  ["clients", "Client wise"],
  ["analysis", "Full analysis"],
];
function route(): Tab {
  const hash = location.hash.slice(1);
  return tabs.some(([id]) => id === hash) ? (hash as Tab) : "overview";
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert">
        This Management view could not be shown.{" "}
        <button onClick={() => location.reload()}>Reload Management</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const state = useSyncExternalStore(store.subscribe, store.snapshot),
    [tab, setTab] = useState<Tab>(route),
    [who, setWho] = useState(""),
    [stage, setStage] = useState(""),
    [only, setOnly] = useState(""),
    [range, setRange] = useState<Range>("all"),
    [open, setOpen] = useState<Open | null>(null),
    all = (state.data?.clients || []).filter((c) => c.stage !== "bin"),
    live = liveClients(all),
    shown = forPerson(live, who),
    client =
      open?.kind === "client" ? all.find((c) => c.id === open.id) : undefined,
    person =
      open?.kind === "person"
        ? window.People.list.find((p) => p.id === open.id)
        : undefined;
  useEffect(() => {
    const onHash = () => {
      setTab(route());
      setOpen(null);
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
        if (
          !open &&
          !document.hidden &&
          !document.activeElement?.matches("input,select,textarea")
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
  const go = (next: Tab) => {
    history.pushState(null, "", "#" + next);
    setTab(next);
    setOpen(null);
  };
  return (
    <Boundary>
      <AppHeader current="management" />
      <div className="crm-page-toolbar management-tools">
        <nav className="tabs" aria-label="Management views">
          {tabs.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={tab === id ? "on" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <Select
          label="Person"
          value={who}
          onChange={setWho}
          options={[
            ["", "Whole team"],
            ...window.People.list.map(
              (p) => [p.id, p.role + " · " + p.name] as [string, string],
            ),
          ]}
        />
        <span className="management-readonly">Read only</span>
      </div>
      {(!state.data || state.error) && (
        <div
          className="management-status"
          role={state.error ? "alert" : "status"}
        >
          {state.error || "Loading Management…"}
          {state.error && (
            <>
              <span>{state.data ? "Showing the last loaded data." : ""}</span>
              <button
                className="btn"
                disabled={state.loading}
                onClick={() => void store.load()}
              >
                Retry loading
              </button>
            </>
          )}
        </div>
      )}
      {!state.data && !state.error && (
        <Skeleton tiles={4} label="Loading Management" />
      )}
      {state.data && (
        <main className="body management-body">
          {tab === "overview" ? (
            <Overview shown={shown} live={live} who={who} show={setOpen} />
          ) : tab === "people" ? (
            <PeoplePage live={live} show={setOpen} />
          ) : tab === "clients" ? (
            <ClientsPage
              shown={shown}
              stage={stage}
              only={only}
              setStage={setStage}
              setOnly={setOnly}
              show={setOpen}
            />
          ) : (
            <Analysis
              all={forPerson(all, who)}
              range={range}
              setRange={setRange}
            />
          )}
        </main>
      )}
      {client && (
        <ClientDetail
          key={"client-" + client.id}
          c={client}
          close={() => setOpen(null)}
        />
      )}{" "}
      {person && (
        <PersonDetail
          key={"person-" + person.id}
          p={person}
          live={live}
          show={setOpen}
          close={() => setOpen(null)}
        />
      )}
    </Boundary>
  );
}
