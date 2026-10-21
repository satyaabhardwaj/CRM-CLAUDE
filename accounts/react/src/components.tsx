import { useEffect, useRef, type ReactNode } from "react";
import { K, type Client } from "./model";
export function Card({
  title,
  tag,
  tone = "blue",
  children,
}: {
  title: string;
  tag?: ReactNode;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className={"card-h t-" + tone}>
        <h2>{title}</h2>
        <span>{tag}</span>
      </div>
      <div className="card-b">{children}</div>
    </section>
  );
}
export function Pill({
  children,
  tone = "grey",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"pill " + tone}>{children}</span>;
}
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts a-facts">
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value || "Not given"}</dd>
        </div>
      ))}
    </dl>
  );
}
export type Open = (
  client: Client,
  kind?: "expected" | "booking" | "payment",
  at?: string,
) => void;
export function List({
  title,
  items,
  empty,
  tag,
}: {
  title: string;
  items: {
    id: string;
    name: string;
    sub: string;
    pill: ReactNode;
    pick: () => void;
  }[];
  empty: string;
  tag?: ReactNode;
}) {
  return (
    <Card title={title} tag={tag}>
      <div className="rows">
        {items.length ? (
          items.map((r) => (
            <button className="row a-row" key={r.id} onClick={r.pick}>
              <span className="who">
                <b>{r.name}</b>
                <small>{r.sub}</small>
              </span>
              {r.pill}
            </button>
          ))
        ) : (
          <p className="empty">{empty}</p>
        )}
      </div>
    </Card>
  );
}
export function Dialog({
  title,
  sub,
  tag,
  onClose,
  busy,
  children,
}: {
  title: string;
  sub?: string;
  tag?: ReactNode;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="a-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="sheet-h">
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
          {tag}
        </div>
        <button
          className="btn"
          disabled={busy}
          aria-label="Close details"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <div className="sheet-b">{children}</div>
    </dialog>
  );
}
export function FileLink({
  client,
  name,
  label,
}: {
  client: Client;
  name?: string;
  label: string;
}) {
  return (
    <div className="line rule">
      <span>{label}</span>
      {name ? (
        <a
          target="_blank"
          rel="noopener"
          href={
            "/data/uploads/" +
            encodeURIComponent(client.id) +
            "/" +
            encodeURIComponent(name)
          }
        >
          {name}
        </a>
      ) : (
        <span className="sub">Not uploaded</span>
      )}
    </div>
  );
}
export function Money({ value }: { value: number }) {
  return <span className="num">{K().money(value)}</span>;
}
