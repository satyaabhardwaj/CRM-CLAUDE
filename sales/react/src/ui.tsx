import { uploadTemporary } from "../../../shared/uploads";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { upload } from "./data";
import { StableLabel } from "../../../backend/react/src/Shell";
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
          <StableLabel busy={busy} idle="Upload" working="Uploading…" />
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
export function Voice({ onText }: { onText: (v: string) => void }) {
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    alive = useRef(true),
    callback = useRef(onText);
  callback.current = onText;
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function record() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatus(
        "This browser cannot record. Open the CRM in Chrome or Safari.",
      );
      return;
    }
    try {
      setBusy(true);
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const rec = new MediaRecorder(s);
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        s.getTracks().forEach((t) => t.stop());
        if (!alive.current) return;
        setBusy(true);
        setStatus("Writing it down…");
        try {
          const sound = new Blob(chunks, {
            type: rec.mimeType || "audio/webm",
          });
          if (!sound.size) throw Error("Nothing was recorded. Try again.");
          const large = sound.size > 3 * 1024 * 1024;
          const payload = large
            ? JSON.stringify({
                upload: await uploadTemporary(sound),
                type: sound.type,
              })
            : sound;
          const r = await fetch("/api/ai/transcribe", {
            method: "POST",
            headers: {
              "Content-Type": large ? "application/json" : sound.type,
            },
            body: payload,
            signal: AbortSignal.timeout(60000),
          });
          const out = await r.json();
          if (!r.ok || !out.text)
            throw Error(
              out.error === "no key"
                ? "Voice to text is not configured."
                : "Could not write it down. Please retry.",
            );
          if (alive.current) {
            callback.current(out.text);
            setStatus("");
          }
        } catch (e) {
          if (alive.current)
            setStatus(e instanceof Error ? e.message : "Voice to text failed.");
        } finally {
          recorder.current = null;
          if (alive.current) setBusy(false);
        }
      };
      rec.start();
      setBusy(false);
      setStatus("Recording… press again to stop.");
    } catch {
      setBusy(false);
      setStatus(
        "The microphone is blocked. Allow it in your browser and try again.",
      );
    }
  }
  return (
    <span>
      <Button disabled={busy} onClick={() => void record()}>
        {recorder.current?.state === "recording"
          ? "Stop recording"
          : "Record voice note"}
      </Button>
      <span role="status">{status}</span>
    </span>
  );
}
