import { useEffect, useRef, useState, type ReactNode } from "react";
import { upload } from "./data";
export const now = () => new Date().toISOString();
export const money = (v: unknown) =>
  "₹" + (Number(v) || 0).toLocaleString("en-IN");
export const day = (v?: string) =>
  v
    ? new Date(v).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not set";
export function Card({
  title,
  meta,
  tone = "grey",
  children,
}: {
  title: string;
  meta?: ReactNode;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className={"card-h t-" + tone}>
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
      <div className="card-b">{children}</div>
    </section>
  );
}
export function Button({
  children,
  onClick,
  disabled,
  tone = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: string;
}) {
  return (
    <button
      type="button"
      className={"btn " + tone}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
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
export function Field({
  label,
  value,
  onCommit,
  type = "text",
  placeholder,
  immediate = false,
}: {
  label: string;
  value?: string | number | null;
  onCommit: (v: string) => void;
  type?: string;
  placeholder?: string;
  immediate?: boolean;
}) {
  const saved = String(value ?? "");
  const [draft, setDraft] = useState(saved);
  const last = useRef(saved);
  useEffect(() => {
    setDraft(saved);
    last.current = saved;
  }, [saved]);
  const commit = (value: string) => {
    if (last.current !== value) {
      last.current = value;
      setDraft(value);
      onCommit(value);
    }
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          if (immediate && last.current !== e.target.value) {
            last.current = e.target.value;
            onCommit(e.target.value);
          }
        }}
        onInput={(e) => {
          setDraft(e.currentTarget.value);
          if (immediate && last.current !== e.currentTarget.value) {
            last.current = e.currentTarget.value;
            onCommit(e.currentTarget.value);
          }
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget.value);
          }
        }}
      />
    </label>
  );
}
export type Option = string | readonly [string, string];
export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose",
}: {
  label: string;
  value?: string | number;
  options: readonly Option[];
  onChange: (v: string) => void;
  placeholder?: string | false;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder !== false && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const [v, text] = typeof o === "string" ? [o, o] : o;
          return (
            <option key={v} value={v}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flexrow">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
export function Choice({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="checks" role="group" aria-label={label}>
        {["Yes", "No"].map((v) => (
          <button
            key={v}
            type="button"
            className={"btn " + (value === v ? "dark" : "")}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
export function FileLink({
  owner,
  name,
  label,
}: {
  owner: string;
  name?: string;
  label?: string;
}) {
  return name ? (
    <a
      href={
        "/data/uploads/" +
        encodeURIComponent(owner) +
        "/" +
        encodeURIComponent(name)
      }
      target="_blank"
      rel="noreferrer"
    >
      {label || name}
    </a>
  ) : null;
}
export function Attachment({
  owner,
  name,
  label,
  onUploaded,
}: {
  owner: string;
  name?: string;
  label: string;
  onUploaded: (name: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <div className="stack">
      <div className="line">
        <span>
          {label} <FileLink owner={owner} name={name} />
        </span>
        <label className="btn small">
          {busy ? "Uploading…" : "Upload"}
          <input
            aria-label={label + " upload"}
            type="file"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || busy) return;
              setBusy(true);
              setError("");
              try {
                const n = await upload(owner, f);
                onUploaded(n);
              } catch (err) {
                if (alive.current)
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Upload failed. Please retry.",
                  );
              } finally {
                if (alive.current) setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {error && (
        <p className="msg" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
