import { useEffect, useRef, useState, type ReactNode } from "react";
import { HeaderSession } from "./Auth";

// The one breakpoint set (keep in step with shared/tokens.css).
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;
// Below lg the sidebar is a drawer and the page scrolls as one document.
export const DRAWER_QUERY = `(max-width: ${BREAKPOINTS.lg - 0.02}px)`;
// The header asks the module's sidebar to open its drawer with this event.
export const OPEN_NAVIGATION = "crm:open-navigation";

export type Department =
  | "sales"
  | "design"
  | "measurement"
  | "accounts"
  | "management";
export const DEPARTMENTS: [Department, string][] = [
  ["sales", "Sales"],
  ["design", "Design"],
  ["measurement", "Measurement"],
  ["accounts", "Accounts"],
  ["management", "Management"],
];

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
export const ICONS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4",
  close: "M6 6l12 12M18 6 6 18",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  plus: "M12 5v14M5 12h14",
};
export function ShellIcon({ name }: { name: keyof typeof ICONS }) {
  return <Icon d={ICONS[name]} />;
}

/* One header for every module: logo and department tabs on the left, search in the centre,
   module actions, then the user menu on the right. Its height never changes with content:
   items collapse in a fixed order (see shared/workspace.css) instead of wrapping. */
export function AppHeader({
  current,
  navigation,
  search,
  actions,
  primary,
}: {
  current: Department;
  // Label of the module's sidebar; shows the menu button that opens it as a drawer on small screens.
  navigation?: string;
  search?: ReactNode;
  actions?: ReactNode;
  // The page's main action; a floating button on phones.
  primary?: ReactNode;
}) {
  const [searching, setSearching] = useState(false);
  const searchBox = useRef<HTMLDivElement>(null),
    tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    if (searching) searchBox.current?.querySelector("input")?.focus();
  }, [searching]);
  useEffect(() => {
    // On narrow screens the department strip scrolls; keep the current one in view.
    const active = tabs.current?.querySelector<HTMLElement>(".on");
    const strip = tabs.current;
    if (active && strip && strip.scrollWidth > strip.clientWidth)
      strip.scrollLeft =
        active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  }, []);
  return (
    <header className={"top app-header" + (searching ? " searching" : "")}>
      <div className="app-header-start">
        {navigation ? (
          <button
            type="button"
            className="app-icon-button app-menu"
            aria-label={"Open " + navigation}
            onClick={(e) =>
              window.dispatchEvent(
                new CustomEvent(OPEN_NAVIGATION, { detail: e.currentTarget }),
              )
            }
          >
            <ShellIcon name="menu" />
          </button>
        ) : (
          <span className="app-menu app-menu-space" aria-hidden="true" />
        )}
        <div className="app-logo" role="img" aria-label="MAGPPIE">
          <span className="app-logo-mark" aria-hidden="true">
            M
          </span>
          <span className="app-logo-word" aria-hidden="true">
            MAGPPIE
          </span>
        </div>
      </div>
      <nav className="depts app-tabs" aria-label="Departments" ref={tabs}>
        {DEPARTMENTS.map(([id, label]) => (
          <a
            key={id}
            href={"/" + id + "/"}
            className={id === current ? "on" : undefined}
            aria-current={id === current ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {search && (
        <div
          className="app-header-search"
          ref={searchBox}
          onKeyDown={(e) => {
            if (e.key === "Escape" && searching) {
              setSearching(false);
              searchBox.current?.parentElement
                ?.querySelector<HTMLButtonElement>(".app-search-toggle")
                ?.focus();
            }
          }}
        >
          {search}
        </div>
      )}
      <div className="app-header-actions">
        {search && (
          <button
            type="button"
            className="app-icon-button app-search-toggle"
            aria-label={searching ? "Close search" : "Search"}
            aria-expanded={searching}
            onClick={() => setSearching(!searching)}
          >
            <ShellIcon name={searching ? "close" : "search"} />
          </button>
        )}
        {actions}
        {primary && <div className="app-primary">{primary}</div>}
        <HeaderSession />
      </div>
    </header>
  );
}

// Holds the bell's place while a module loads, so the header keeps its width.
export function BellPlaceholder() {
  return (
    <div className="bell-wrap">
      <button
        type="button"
        className="btn round bell"
        aria-label="Notifications, loading"
        disabled
      >
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9M10 20a2 2 0 0 0 4 0" />
        </svg>
      </button>
    </div>
  );
}
