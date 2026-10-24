import { Sidebar } from "../../../backend/react/src/Sidebar";
import { AppHeader } from "../../../backend/react/src/Shell";
import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Notifications } from "./Notifications";
import { VisitsPage } from "./visits";
import { MyVisits } from "./mine";
import { focusOf } from "./navigation";
import "./style.css";
// One screen for Measurement (Manish, 24 Oct 2026): the two parts (Visits, and Requests & reports) became one. The
// home page is the visits board with all four visit types; the side menu adds who is assigned where, the special
// approvals (new dates, revisits) and the master data.
// Old links (#all/overview and the like) land on the board.
const PAGES = [
  ["visits", "Visits"],
  ["assigned", "Assigned"],
  ["approvals", "Special approvals"],
  ["team", "Team & checklists"],
] as const;
type Page = (typeof PAGES)[number][0];
const pageOf = (hash = location.hash): Page => {
  const id = hash
    .replace(/^#/, "")
    .replace(/^crm\//, "")
    .split("/")[0];
  return (PAGES.find((p) => p[0] === id)?.[0] || "visits") as Page;
};
const sidebarItems = PAGES.map(([id, label]) => ({ id: id as string, label }));
function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const change = () => setHash(location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  if (location.pathname.replace(/\/$/, "") === "/my-visits")
    return <MyVisits />;
  const page = pageOf(hash);
  const focus = focusOf(hash);
  return (
    <>
      <AppHeader
        current="measurement"
        navigation="Measurement navigation"
        actions={<Notifications />}
      />
      <div className="body">
        <Sidebar
          id="measurement"
          label="Measurement navigation"
          active={page}
          items={sidebarItems}
          onNavigate={(id) => {
            location.hash = "crm/" + id;
          }}
        />
        <main className="main">
          <VisitsPage
            page={page}
            focus={focus.id}
            focusType={focus.type}
            focusSite={focus.site}
          />
        </main>
      </div>
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
    <Root />
  </Boundary>,
);
