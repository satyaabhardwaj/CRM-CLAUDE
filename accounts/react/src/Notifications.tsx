import { useState } from "react";
import { Dialog, Card } from "./components";
import { readStore } from "./store";
import { type Store } from "./model";
export function Notifications({
  data,
  writable,
  refresh,
  onOpen,
}: {
  data: Store;
  writable: boolean;
  refresh: () => Promise<void>;
  /** Clicking a notification takes you to that client (24 Oct 2026). */
  onOpen: (clientId: string, text: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const sources = ["Sales", "Design", "Measurement", "Installation", "PDI"];
  // Removed with the cross or Clear all (24 Oct 2026); the same line twice for one client shows once.
  const hidden = data.seen?.accounts?.hidden || {},
    once = new Set<string>();
  const items = data.clients
    .filter((c) => !["bin", "lost"].includes(c.stage))
    .flatMap((c) =>
      (c.news || []).map((n) => ({
        ...n,
        id: c.id + n.at,
        clientId: c.id,
        key: c.id + "|" + n.text,
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
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((n) => {
      if (hidden[n.id] || once.has(n.key)) return false;
      once.add(n.key);
      return true;
    });
  const unread = items.filter(
    (n) => n.at > (data.seen?.accounts?.at || ""),
  ).length;
  async function show() {
    setOpen(true);
    if (!unread || !writable) return;
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
  type Mark = NonNullable<Store["seen"]>[string];
  async function mark(change: (m: Mark | undefined) => Mark, failure: string) {
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
              accounts: change(latest.seen?.accounts),
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
              <Card
                key={source}
                title={"From " + source}
                tag={
                  writable &&
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
                    <div className="note note-row" key={n.id + i}>
                      <button
                        type="button"
                        className="note-go"
                        onClick={() => {
                          setOpen(false);
                          onOpen(n.clientId, n.text);
                        }}
                      >
                        <b>{n.client}</b>
                        <p>{n.text}</p>
                        <small>{new Date(n.at).toLocaleString()}</small>
                      </button>
                      {writable && (
                        <button
                          type="button"
                          className="note-x"
                          aria-label={"Remove: " + n.client + ", " + n.text}
                          title="Remove"
                          onClick={() => void hide([n.id])}
                        >
                          ×
                        </button>
                      )}
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
