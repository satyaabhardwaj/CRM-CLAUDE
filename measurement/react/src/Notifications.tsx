import { useEffect, useState } from "react";
import { Dialog, Card } from "./components";
import { notificationHash } from "./navigation";
interface News {
  at: string;
  text: string;
  from?: string;
}
interface Store {
  rev?: number;
  clients: { id: string; name: string; stage: string; news?: News[] }[];
  seen?: Record<string, { at: string; hidden?: Record<string, boolean> }>;
}
export function Notifications() {
  const [store, setStore] = useState<Store | null>(null),
    [opened, setOpened] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    const load = () =>
      fetch("/api/store", { signal: abort.signal, cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data: Store) => {
          // Keep the same object when nothing changed, so the bell does not redraw.
          setStore((old) =>
            old && data.rev !== undefined && old.rev === data.rev ? old : data,
          );
          setError("");
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setError("Notifications could not be loaded.");
        });
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 4000);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, []);
  const from = (n: News) =>
    n.from ||
    (/accounts/i.test(n.text)
      ? "Accounts"
      : /design|proposal/i.test(n.text)
        ? "Design"
        : "Sales");
  // Measurement hears only about measurement: requests and visits from Sales and Design (and the special approvals
  // that lead to a request), not proposals, payments or bookings (Manish, 24 Oct 2026).
  const forMeasurement = (n: News) =>
    /measurement|visit|revisit|special approval/i.test(n.text);
  // Removed with the cross or Clear all (24 Oct 2026); the same line twice for one client shows once.
  const hidden = store?.seen?.measurement?.hidden || {},
    once = new Set<string>();
  const items = (store?.clients || [])
    .filter((c) => !["bin", "lost"].includes(c.stage))
    .flatMap((c) =>
      (c.news || [])
        .filter(
          (n) => ["Sales", "Design"].includes(from(n)) && forMeasurement(n),
        )
        .map((n) => ({
          ...n,
          id: c.id + n.at,
          clientId: c.id,
          key: c.id + "|" + n.text,
          client: c.name,
          source: from(n),
        })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((n) => {
      if (hidden[n.id] || once.has(n.key)) return false;
      once.add(n.key);
      return true;
    });
  const unread = items.filter(
    (n) => n.at > (store?.seen?.measurement?.at || ""),
  ).length;
  async function show() {
    setOpened(true);
    if (!unread) return;
    await mark(
      (m) => ({ ...m, at: new Date().toISOString() }),
      "Notifications are visible, but could not be marked as read.",
    );
  }
  const hide = (ids: string[]) =>
    mark(
      (m) => ({
        at: m?.at || "",
        hidden: Object.fromEntries(
          Object.entries({
            ...m?.hidden,
            ...Object.fromEntries(ids.map((id) => [id, true])),
          }).slice(-1000),
        ),
      }),
      "The notification could not be removed. Please try again.",
    );
  async function mark(
    change: (m: NonNullable<Store["seen"]>[string] | undefined) => {
      at: string;
      hidden?: Record<string, boolean>;
    },
    failure: string,
  ) {
    try {
      // Re-read before the existing optimistic store contract; never replace a stale snapshot.
      for (let attempt = 0; attempt < 2; attempt++) {
        const get = await fetch("/api/store", { cache: "no-store" });
        if (!get.ok) throw new Error();
        const latest: Store = await get.json();
        const next = {
          ...latest,
          seen: {
            ...latest.seen,
            measurement: change(latest.seen?.measurement),
          },
        };
        const save = await fetch("/api/store", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (save.status === 409) continue;
        if (!save.ok) throw new Error();
        setStore(next);
        return;
      }
      throw new Error();
    } catch {
      setError(failure);
    }
  }
  return (
    <>
      <button
        className="btn round bell"
        aria-label={`Notifications, ${unread} new`}
        onClick={() => void show()}
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
        {unread > 0 && (
          <span className="badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {opened && (
        <Dialog title="Notifications" onClose={() => setOpened(false)}>
          {error && <p role="status">{error}</p>}
          <div className="cols">
            {["Sales", "Design"].map((source) => (
              <Card
                title={"From " + source}
                key={source}
                tag={
                  items.some((n) => n.source === source) && (
                    <button
                      type="button"
                      className="note-clear"
                      onClick={() =>
                        void hide(
                          items
                            .filter((n) => n.source === source)
                            .map((n) => n.id),
                        )
                      }
                    >
                      Clear all
                    </button>
                  )
                }
              >
                {items
                  .filter((n) => n.source === source)
                  .slice(0, 30)
                  .map((n, i) => (
                    <div className="react-notice note-row" key={n.id + i}>
                      <button
                        type="button"
                        className="note-go"
                        onClick={() => {
                          // Clicking takes you to that client's visit on the board (24 Oct 2026).
                          setOpened(false);
                          location.hash = notificationHash(n.clientId, n.text);
                        }}
                      >
                        <strong>{n.client}</strong>
                        <p>{n.text}</p>
                        <small>{new Date(n.at).toLocaleString()}</small>
                      </button>
                      <button
                        type="button"
                        className="note-x"
                        aria-label={"Remove: " + n.client + ", " + n.text}
                        title="Remove"
                        onClick={() => void hide([n.id])}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                {!items.some((n) => n.source === source) && (
                  <p>No measurement requests from {source} yet.</p>
                )}
              </Card>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
