import { useEffect, useState } from "react";
import { Dialog, Card } from "./components";
interface News {
  at: string;
  text: string;
  from?: string;
}
interface Store {
  rev?: number;
  clients: { name: string; stage: string; news?: News[] }[];
  seen?: Record<string, { at: string }>;
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
  const items = (store?.clients || [])
    .filter((c) => !["bin", "lost"].includes(c.stage))
    .flatMap((c) =>
      (c.news || [])
        .filter((n) => ["Sales", "Design"].includes(from(n)))
        .map((n) => ({ ...n, client: c.name, source: from(n) })),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const unread = items.filter(
    (n) => n.at > (store?.seen?.measurement?.at || ""),
  ).length;
  async function show() {
    setOpened(true);
    if (!unread) return;
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
            measurement: { at: new Date().toISOString() },
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
      setError("Notifications are visible, but could not be marked as read.");
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
              <Card title={"From " + source} key={source}>
                {items
                  .filter((n) => n.source === source)
                  .slice(0, 30)
                  .map((n, i) => (
                    <div className="react-notice" key={n.at + i}>
                      <strong>{n.client}</strong>
                      <p>{n.text}</p>
                      <small>{new Date(n.at).toLocaleString()}</small>
                    </div>
                  ))}
                {!items.some((n) => n.source === source) && (
                  <p>Nothing from {source} yet.</p>
                )}
              </Card>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
