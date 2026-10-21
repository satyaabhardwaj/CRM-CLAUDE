import { useEffect, useRef, useState } from "react";
import { DRAWER_QUERY, OPEN_NAVIGATION } from "./Shell";

export type SidebarItem = {
  id: string;
  label: string;
  count?: number;
  group?: string;
  description?: string;
};
export function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    qualified: "M4 5h16v10H9l-5 4V5Z",
    design: "m4 16 12-12 4 4L8 20H4v-4Z",
    booked: "M5 4h14v16H5V4Zm3 5h8m-8 4h8",
    approvals: "m5 12 4 4L19 6",
    team: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 9v-3a5 5 0 0 1 10 0v3m2-14a3 3 0 0 1 0 6m2 3a4 4 0 0 1 4 4",
    payments: "M3 5h18v14H3V5Zm0 5h18m-5 5h2",
    incentive: "M4 20V12h4v8m2 0V8h4v12m2 0V4h4v16",
    architects: "M4 20V8l8-5 8 5v12M9 20v-6h6v6M8 9h1m6 0h1",
    bin: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
    home: "m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7",
    areas: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16",
    reports: "M5 3h10l4 4v14H5V3Zm4 8h6m-6 4h6",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          paths[name] ||
          "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z"
        }
      />
    </svg>
  );
}
export function Sidebar({
  id,
  label,
  items,
  active,
  onNavigate,
}: {
  id: string;
  label: string;
  items: SidebarItem[];
  active: string;
  onNavigate: (id: string) => void;
}) {
  const key = "crm.ui.sidebar." + id;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === "collapsed";
    } catch {
      return false;
    }
  });
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLElement | null>(null),
    swipe = useRef<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [mobile, setMobile] = useState(() => matchMedia(DRAWER_QUERY).matches);
  useEffect(() => {
    const query = matchMedia(DRAWER_QUERY);
    const update = () => {
      setMobile(query.matches);
      if (!query.matches && dialog.current?.open) close();
    };
    query.addEventListener("change", update);
    // The header's menu button asks for the drawer; focus goes back to it on close.
    const open = (e: Event) => openDrawer((e as CustomEvent).detail);
    window.addEventListener(OPEN_NAVIGATION, open);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener(OPEN_NAVIGATION, open);
    };
  }, []);
  function openDrawer(from?: unknown) {
    opener.current =
      from instanceof HTMLElement
        ? from
        : (document.activeElement as HTMLElement);
    dialog.current?.showModal();
    setDrawer(true);
  }
  function close() {
    dialog.current?.close();
    setDrawer(false);
    (opener.current?.isConnected ? opener.current : trigger.current)?.focus();
  }
  function toggle() {
    if (matchMedia(DRAWER_QUERY).matches) {
      openDrawer(trigger.current);
    } else {
      setCollapsed(!collapsed);
      try {
        localStorage.setItem(key, collapsed ? "expanded" : "collapsed");
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
    }
  }
  function links() {
    return [...new Set(items.map((i) => i.group || "Workspace"))]
      .sort((a, b) => {
        const rank = (g: string) =>
          g === "Settings" ? 2 : g === "Management" ? 1 : 0;
        return rank(a) - rank(b);
      })
      .map((group) => (
        <section className="crm-nav-group" key={group}>
          <h2>{group}</h2>
          {items
            .filter((i) => (i.group || "Workspace") === group)
            .map((item) => (
              <button
                type="button"
                key={item.id}
                className={
                  "crm-nav-item" + (active === item.id ? " active" : "")
                }
                aria-current={active === item.id ? "page" : undefined}
                title={
                  item.label +
                  (item.count == null ? "" : ` (${item.count})`) +
                  (item.description ? " - " + item.description : "")
                }
                aria-label={
                  item.label + (item.count == null ? "" : `, ${item.count}`)
                }
                onClick={() => {
                  onNavigate(item.id);
                  if (dialog.current?.open) close();
                }}
              >
                <NavIcon name={item.id} />
                <span className="crm-nav-label">{item.label}</span>
                {item.count != null && (
                  <span className="crm-nav-count">{item.count}</span>
                )}
              </button>
            ))}
        </section>
      ));
  }
  return (
    <>
      <aside className={"crm-sidebar" + (collapsed ? " collapsed" : "")}>
        <button
          ref={trigger}
          type="button"
          className="crm-sidebar-toggle"
          aria-label={"Toggle " + label}
          aria-expanded={mobile ? drawer : !collapsed}
          onClick={toggle}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
          </svg>
          <span className="crm-nav-label">{label}</span>
        </button>
        <nav aria-label={label}>{links()}</nav>
      </aside>
      <dialog
        ref={dialog}
        className="crm-drawer"
        aria-label={label}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        onPointerDown={(e) => {
          swipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          // A swipe towards the edge it came from closes the drawer.
          if (swipe.current !== null && swipe.current - e.clientX > 60) close();
          swipe.current = null;
        }}
      >
        <div className="crm-drawer-content">
          <div className="crm-drawer-title">
            <b>{label}</b>
            <button
              type="button"
              className="app-icon-button"
              onClick={close}
              aria-label="Close navigation"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <nav aria-label={label}>{links()}</nav>
        </div>
      </dialog>
    </>
  );
}
