import { useCallback, useEffect, useRef, useState } from "react";
import { loginUrl } from "../../../shared/session";
import { signOut } from "./api";

// Warn 2 minutes before the session ends (owner decision, 22 Oct 2026). Real keyboard or mouse use
// pings the server at most once a minute; background polling never does, so an idle tab signs out.
export const WARN_SECONDS = 120;
const PING_EVERY = 60_000;
const TICK = 1000;

interface Times {
  idle: number; // local ms timestamp of the idle expiry
  max: number; // local ms timestamp of the 12-hour limit
}
function parse(value: unknown, now: number): Times | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("idle_expires_at" in value) ||
    !("expires_at" in value) ||
    !("now" in value) ||
    typeof value.idle_expires_at !== "number" ||
    typeof value.expires_at !== "number" ||
    typeof value.now !== "number"
  )
    return null;
  // Use the server's clock for the remaining time, so a wrong laptop clock cannot shift the warning.
  return {
    idle: now + (value.idle_expires_at - value.now) * 1000,
    max: now + (value.expires_at - value.now) * 1000,
  };
}

function shut(element: HTMLDialogElement | null) {
  if (!element?.open) return;
  if (typeof element.close === "function") element.close();
  else element.removeAttribute("open");
}

const minutes = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function SessionGuard({
  clock = () => Date.now(),
  navigate = (url: string) => location.assign(url),
}: {
  clock?: () => number;
  navigate?: (url: string) => void;
}) {
  const [times, setTimes] = useState<Times | null>(null);
  const [now, setNow] = useState(clock);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  const used = useRef(false);
  const lastPing = useRef(0);
  const ended = useRef(false);
  const checked = useRef("");

  const read = useCallback(
    async (path: string, method = "GET") => {
      const response = await fetch(path, {
        method,
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 401) return "ended" as const;
      if (!response.ok) return null;
      return parse(await response.json(), clock());
    },
    [clock],
  );
  const end = useCallback(
    (reason: "idle" | "ended") => {
      if (ended.current) return;
      ended.current = true;
      shut(dialog.current);
      navigate(loginUrl(reason));
    },
    [navigate],
  );
  const apply = useCallback(
    (value: Times | "ended" | null) => {
      if (value === "ended") end("ended");
      else if (value) setTimes(value);
    },
    [end],
  );
  const ping = useCallback(async () => {
    lastPing.current = clock();
    used.current = false;
    apply(await read("/api/auth/activity", "POST").catch(() => null));
  }, [apply, clock, read]);

  useEffect(() => {
    void read("/api/auth/me")
      .then(apply)
      .catch(() => {});
    lastPing.current = clock();
    const mark = () => {
      used.current = true;
    };
    const stop = () => {
      ended.current = true;
    };
    window.addEventListener("pointerdown", mark, true);
    window.addEventListener("keydown", mark, true);
    window.addEventListener("crm:session-ended", stop);
    const timer = setInterval(() => setNow(clock()), TICK);
    return () => {
      window.removeEventListener("pointerdown", mark, true);
      window.removeEventListener("keydown", mark, true);
      window.removeEventListener("crm:session-ended", stop);
      clearInterval(timer);
    };
  }, [apply, clock, read]);

  // Real use since the last ping: tell the server, at most once a minute.
  useEffect(() => {
    if (!times || ended.current || busy) return;
    if (used.current && now - lastPing.current >= PING_EVERY) void ping();
  }, [now, times, busy, ping]);

  const deadline = times ? Math.min(times.idle, times.max) : null;
  const remaining = deadline === null ? null : deadline - now;
  const warn =
    remaining !== null &&
    remaining <= WARN_SECONDS * 1000 &&
    dismissed !== deadline &&
    !ended.current;

  // At the warning point or the end, ask the server first: another tab may have kept the session going.
  useEffect(() => {
    if (remaining === null || ended.current) return;
    if (remaining > WARN_SECONDS * 1000) return;
    const step = `${deadline}:${remaining > 0 ? "warn" : "end"}`;
    if (checked.current === step) return;
    checked.current = step;
    void read("/api/auth/me")
      .then((value) => {
        if (
          value === "ended" ||
          (value && Math.min(value.idle, value.max) <= clock())
        )
          end("idle");
        else if (
          value &&
          deadline !== null &&
          Math.min(value.idle, value.max) > deadline
        )
          setTimes(value);
        else if (remaining <= 0) end("idle");
      })
      .catch(() => {
        if (remaining <= 0) end("idle");
      });
  }, [remaining, dismissed, deadline, read, end, clock]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (warn && !element.open) {
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
      stay.current?.focus();
    } else if (!warn && element.open) shut(element);
  }, [warn]);

  const hardLimit = times !== null && times.max <= times.idle;
  const close = () => setDismissed(deadline);
  return (
    <dialog
      ref={dialog}
      className="session-dialog"
      role="alertdialog"
      aria-labelledby="session-dialog-title"
      aria-describedby="session-dialog-text"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
      style={{
        maxWidth: "min(420px, calc(100vw - 32px))",
        padding: "20px",
        border: "1px solid var(--color-edge, #d0d5dd)",
        borderRadius: "var(--radius-lg, 12px)",
        background: "var(--color-surface, #fff)",
        color: "var(--color-ink, #1d2433)",
        font: "inherit",
      }}
    >
      {warn && (
        <>
          <h2
            id="session-dialog-title"
            style={{ margin: "0 0 8px", fontSize: "18px" }}
          >
            {hardLimit ? "Sign-in ends soon" : "Still there?"}
          </h2>
          <p id="session-dialog-text" style={{ margin: "0 0 16px" }}>
            {hardLimit
              ? `For security, every sign-in ends after 12 hours. You will be asked to sign in again in ${minutes(remaining ?? 0)}. Unsaved changes are kept.`
              : `You will be signed out in ${minutes(remaining ?? 0)} because the CRM has not been used for a while. Unsaved changes are kept.`}
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {hardLimit ? (
              <button
                ref={stay}
                type="button"
                className="btn dark"
                onClick={close}
              >
                OK
              </button>
            ) : (
              <button
                ref={stay}
                type="button"
                className="btn dark"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void ping().finally(() => {
                    setBusy(false);
                    setDismissed(null);
                  });
                }}
              >
                {busy ? "Please wait…" : "Stay signed in"}
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                void signOut()
                  .catch(() => {})
                  .finally(() => {
                    ended.current = true;
                    navigate("/login");
                  });
              }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
