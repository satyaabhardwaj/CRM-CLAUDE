import { useState } from "react";
import { Dialog, Card } from "./components";
import { readStore } from "./store";
import { type Store } from "./model";
export function Notifications({
  data,
  writable,
  refresh,
}: {
  data: Store;
  writable: boolean;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const sources = ["Sales", "Design", "Measurement", "Installation", "PDI"];
  const items = data.clients
    .filter((c) => !["bin", "lost"].includes(c.stage))
    .flatMap((c) =>
      (c.news || []).map((n) => ({
        ...n,
        client: c.name,
        source:
          n.from ||
          (/accounts/i.test(n.text)
            ? "Accounts"
            : /design|proposal/i.test(n.text)
              ? "Design"
              : "Sales"),
      })),
    )
    .filter((n) => sources.includes(n.source))
    .sort((a, b) => b.at.localeCompare(a.at));
  const unread = items.filter(
    (n) => n.at > (data.seen?.accounts?.at || ""),
  ).length;
  async function show() {
    setOpen(true);
    if (!unread || !writable) return;
    try {
      for (let i = 0; i < 3; i++) {
        const latest = await readStore();
        const response = await fetch("/api/store", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...latest,
            seen: {
              ...latest.seen,
              accounts: { at: new Date().toISOString() },
            },
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (response.status === 409) continue;
        if (!response.ok) throw Error();
        await refresh();
        return;
      }
      throw Error();
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
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>
      {open && (
        <Dialog
          title="Notifications"
          busy={false}
          onClose={() => setOpen(false)}
        >
          {error && <p role="status">{error}</p>}
          <div className="a-notices">
            {sources.map((source) => (
              <Card key={source} title={"From " + source}>
                {items
                  .filter((n) => n.source === source)
                  .slice(0, 30)
                  .map((n, i) => (
                    <div className="note" key={n.at + i}>
                      <b>{n.client}</b>
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
