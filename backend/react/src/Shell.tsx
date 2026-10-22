import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
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
  useAutoTitle();
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

// A button whose label changes while busy keeps one width: both labels share a grid cell.
export function StableLabel({
  busy,
  idle,
  working,
}: {
  busy: boolean;
  idle: ReactNode;
  working: ReactNode;
}) {
  return (
    <span className="btn-stack">
      <span aria-hidden={busy}>{idle}</span>
      <span aria-hidden={!busy}>{working}</span>
    </span>
  );
}

// Placeholder in the shape of a module's first screen, shown until its data arrives.
export function Skeleton({
  sidebar = false,
  tiles = 5,
  cards = 2,
  label = "Loading",
  inline = false,
}: {
  sidebar?: boolean;
  tiles?: number;
  cards?: number;
  label?: string;
  // Inside an existing main column: only the content placeholders.
  inline?: boolean;
}) {
  const content = (
    <div
      className={inline ? "skeleton" : "main skeleton"}
      role={inline ? "status" : undefined}
      aria-label={inline ? label : undefined}
      aria-hidden={inline ? undefined : true}
    >
      <div className="skeleton-tiles">
        {Array.from({ length: tiles }, (_, i) => (
          <div className="skeleton-tile" key={i}>
            <span className="skeleton-bar" style={{ width: "60%" }} />
            <span
              className="skeleton-bar"
              style={{ width: "80%", height: 18, marginTop: 12 }}
            />
          </div>
        ))}
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <div className="skeleton-card" key={i}>
          {[45, 90, 85, 92, 70].map((w, j) => (
            <span key={j} className="skeleton-bar" style={{ width: w + "%" }} />
          ))}
        </div>
      ))}
    </div>
  );
  if (inline) return content;
  return (
    <div className="body" aria-busy="true" aria-label={label}>
      {sidebar && (
        <div className="crm-sidebar skeleton-sidebar" aria-hidden="true">
          {[60, 80, 70, 75, 65].map((w, i) => (
            <span
              key={i}
              className="skeleton-bar"
              style={{ width: w + "%", margin: "15px 12px" }}
            />
          ))}
        </div>
      )}
      {content}
    </div>
  );
}

// Text cut off with an ellipsis shows its full text as a tooltip on hover. One listener for every
// list, row and card, so no screen has to remember to add titles.
export function useAutoTitle() {
  useEffect(() => {
    const show = (e: Event) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.hasAttribute("title") || el.closest("[title]")) return;
      const cs = getComputedStyle(el);
      if (cs.textOverflow !== "ellipsis" || el.scrollWidth <= el.clientWidth)
        return;
      el.setAttribute("title", (el.textContent || "").trim());
    };
    document.addEventListener("pointerover", show);
    (window as unknown as { __crmAutoTitle?: boolean }).__crmAutoTitle = true;
    return () => document.removeEventListener("pointerover", show);
  }, []);
}

// "Also today": a column beside the page from 1280; below that a side panel with a backdrop,
// a close button, Escape to close, and focus moved into it.
export function Rail({
  open,
  onClose,
  children,
  label = "Also today",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}) {
  const panel = useRef<HTMLElement>(null),
    closer = useRef(onClose);
  closer.current = onClose;
  // Runs only when the panel opens or closes, so background refreshes never move focus.
  useEffect(() => {
    if (!open) return;
    const floating = matchMedia(
      `(max-width: ${BREAKPOINTS.xl - 0.02}px)`,
    ).matches;
    const opener = document.activeElement as HTMLElement | null;
    if (floating)
      panel.current?.querySelector<HTMLElement>(".rail-head button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closer.current();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (floating && opener?.isConnected) opener.focus();
    };
  }, [open]);
  return (
    <>
      {open && (
        <button
          type="button"
          className="rail-backdrop"
          aria-label={"Close " + label}
          tabIndex={-1}
          onClick={onClose}
        />
      )}
      <aside
        ref={panel}
        className={"rail" + (open ? " rail-open" : "")}
        aria-label={label}
      >
        <div className="rail-head">
          <b>{label}</b>
          <button
            type="button"
            className="app-icon-button"
            aria-label={"Close " + label}
            onClick={onClose}
          >
            <ShellIcon name="close" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

// Grid tables whose head row is a sibling of the data rows: copy each heading onto its column's
// cells (shown as card labels on phones) and right-align a heading when its column is numeric.
// Attributes only; React keeps owning the content.
export function useCardLabels(box: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = box.current;
    const head = el?.querySelector<HTMLElement>(":scope > .head");
    if (!el || !head) return;
    // A heading may carry a count box; its label is the bold text when there is one.
    const names = [...head.children].map((c) =>
      ((c.querySelector("b") || c).textContent || "").trim(),
    );
    const rows = [...el.children].filter((r) => r !== head);
    names.forEach((name, i) => {
      const cells = rows.map((r) => r.children[i]).filter(Boolean);
      for (const cell of cells) cell.setAttribute("data-label", name);
      if (cells.length && cells.every((c) => c.classList.contains("num")))
        head.children[i]?.classList.add("num");
    });
  });
}

// Saving feedback next to the field that was just changed. The module provides its store's own
// status (no new save logic); a field marks itself when it commits and shows that status inline.
export type SaveState = {
  saving: boolean;
  saved: boolean;
  error: string;
  last: string;
  mark: (id: string) => void;
};
export const SaveStateContext = createContext<SaveState | null>(null);
export function useFieldSave() {
  const save = useContext(SaveStateContext),
    id = useId();
  const state: "" | "saving" | "saved" | "error" =
    save && save.last === id
      ? save.error
        ? "error"
        : save.saving
          ? "saving"
          : save.saved
            ? "saved"
            : ""
      : "";
  return { state, mark: () => save?.mark(id) };
}
export function FieldState({ state }: { state: string }) {
  if (!state) return null;
  return (
    <em className={"field-state " + state} role="status">
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved"
          : "Not saved"}
    </em>
  );
}
