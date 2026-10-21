import { useEffect, useRef, type ReactNode } from "react";
export function Pill({
  children,
  tone = "grey",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"pill " + tone}>{children}</span>;
}
export function Card({
  title,
  note = "",
  tone = "",
  children,
}: {
  title: string;
  note?: ReactNode;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className={"card-h" + (tone ? " t-" + tone : "")}>
        <h2>{title}</h2>
        <span>{note}</span>
      </div>
      <div className="card-b">{children}</div>
    </section>
  );
}
export function Facts({ items }: { items: [string, ReactNode, boolean?][] }) {
  return (
    <div className="facts">
      {items.map(([label, value, bad]) => (
        <div key={label}>
          <span>{label}</span>
          <b className={bad ? "bad" : ""}>{value || "Not yet"}</b>
        </div>
      ))}
    </div>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="management-select">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Modal({
  title,
  tags,
  sub,
  close,
  children,
}: {
  title: string;
  tags: ReactNode;
  sub: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      d = ref.current!;
    d.showModal();
    return () => {
      d.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      className="sheet management-dialog"
      aria-label={title}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <div className="sheet-h">
        <div>
          <div className="flexrow">
            <h2>{title}</h2>
            {tags}
          </div>
          <div className="sub">{sub}</div>
        </div>
        <button className="btn small" onClick={close}>
          Close
        </button>
      </div>
      <div className="sheet-b">{children}</div>
    </dialog>
  );
}
