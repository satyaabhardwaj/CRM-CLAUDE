import { useRef, useState, type FormEvent } from "react";

export function Recovery({ reset = false }: { reset?: boolean }) {
  const [token] = useState(() => {
    const value =
      new URLSearchParams(location.hash.slice(1)).get("token") || "";
    if (reset && location.hash)
      history.replaceState(null, "", location.pathname);
    return value;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (reset && password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/auth/${reset ? "reset-password" : "forgot-password"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reset ? { token, password } : { email }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Could not complete this request.",
        );
      setMessage(data.message);
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (error) {
      setMessage(
        error instanceof Error && error.name !== "TimeoutError"
          ? error.message
          : "Connection unavailable. Try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="auth-card">
      <p className="auth-eyebrow">MAGPPIE CRM</p>
      <h1>{reset ? "Reset password" : "Forgot password?"}</h1>
      <p className="auth-intro">
        {reset
          ? "Choose a unique password of at least 16 characters."
          : "Enter your account email to request a reset link."}
      </p>
      {reset && !validToken ? (
        <p role="alert">
          This reset link is missing or invalid.{" "}
          <a href="/forgot-password">Request a new link</a>.
        </p>
      ) : (
        !done && (
          <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
            {reset ? (
              <>
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={16}
                  maxLength={1024}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={16}
                  maxLength={1024}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </>
            ) : (
              <>
                <label htmlFor="recovery-email">Account email</label>
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </>
            )}
            <button disabled={busy}>
              {busy
                ? "Please wait…"
                : reset
                  ? "Reset password"
                  : "Send reset link"}
            </button>
          </form>
        )
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {reset && !done && validToken && (
        <p>
          <a href="/forgot-password">Request another link</a>
        </p>
      )}
      <p>
        <a href="/login">Back to sign in</a>
      </p>
    </main>
  );
}
