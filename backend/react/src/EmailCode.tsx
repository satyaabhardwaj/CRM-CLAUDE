import { useEffect, useRef, useState, type FormEvent } from "react";
import { safeNext } from "../../../shared/session";
import { AuthLayout, DigitCode, Spinner } from "./MFA";

// Second sign-in step by email (owner decision, 23 Oct 2026): the code sent to the verified mailbox.
const RESEND_AFTER = 30;

async function post(path: string, body?: object) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(30000),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Connection unavailable. Try again.",
    );
  return data as Record<string, unknown>;
}

export function EmailCodeChallenge({
  to,
  navigate = (url: string) => location.assign(url),
}: {
  to: string;
  navigate?: (url: string) => void;
}) {
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [wait, setWait] = useState(RESEND_AFTER),
    pending = useRef(false);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await post("/api/auth/email-code/verify", { code });
      setCode("");
      navigate(
        safeNext(new URLSearchParams(location.search).get("next")) || "/",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Code could not be checked.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function resend() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await post("/api/auth/email-code/resend");
      setCode("");
      setWait(RESEND_AFTER);
      setMessage("A new code is on its way. Only the newest code works.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The code could not be sent.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <p className="auth-eyebrow">MAGPPIE CRM</p>
      <h1>Check your email</h1>
      <p className="auth-intro">
        Enter the six-digit code we sent to <b>{to}</b>. It works once, for 10
        minutes.
      </p>
      <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
        <DigitCode value={code} onChange={setCode} />
        <button disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Checking…" : "Verify and sign in"}
        </button>
      </form>
      <p className="auth-feedback" role="alert" aria-live="polite">
        {message}
      </p>
      <p id="challenge-hint" className="auth-hint">
        No email? Check spam, or ask for a new code.
      </p>
      <button
        type="button"
        className="auth-secondary"
        disabled={busy || wait > 0}
        onClick={() => void resend()}
      >
        {wait > 0 ? `Send a new code (${wait}s)` : "Send a new code"}
      </button>
      <p>
        <a href="/login">Back to sign in</a>
      </p>
    </AuthLayout>
  );
}
