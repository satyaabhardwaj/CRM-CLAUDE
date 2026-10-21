import { useEffect, useRef, useState, type FormEvent } from "react";

export async function mfaRequest(path: string, body?: object) {
  const response = await fetch(`/api/auth/mfa${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Verification unavailable. Try again.",
    );
  return data;
}

export function MFAChallenge({
  navigate = (url: string) => location.assign(url),
}: {
  navigate?: (url: string) => void;
}) {
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await mfaRequest("/verify", { code });
      setCode("");
      navigate("/");
    } catch (error) {
      setMessage(
        error instanceof Error
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
      <h1>Verify your sign-in</h1>
      <p className="auth-intro">
        {backup
          ? "Enter one unused recovery code."
          : "Enter the six-digit code from your authenticator app."}
      </p>
      <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
        <label htmlFor="mfa-code">
          {backup ? "Recovery code" : "Authenticator code"}
        </label>
        <input
          id="mfa-code"
          autoComplete="one-time-code"
          inputMode={backup ? "text" : "numeric"}
          required
          maxLength={50}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button disabled={busy}>
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
      <p role="alert">{message}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBackup(!backup);
          setCode("");
          setMessage("");
        }}
      >
        {backup ? "Use authenticator app" : "Use a recovery code"}
      </button>
      <p>
        <a href="/login">Start sign-in again</a>
      </p>
    </main>
  );
}

export function Security() {
  const [status, setStatus] = useState<{
    available: boolean;
    enabled: boolean;
    recovery_codes: number;
  } | null>(null);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [operation, setOperation] = useState("recovery-codes");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    let current = true;
    void mfaRequest("")
      .then((data) => {
        if (current) setStatus(data);
      })
      .catch((error) => {
        if (current) setMessage(error.message);
      });
    return () => {
      current = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    const action = secret ? "confirm" : status?.enabled ? operation : "setup";
    try {
      const data = await mfaRequest(
        "/" + action,
        action === "setup" ? { password } : { password, code },
      );
      if (action === "setup") {
        setSecret(data.secret);
        setUri(data.uri);
      } else {
        setSecret("");
        setUri("");
        setPassword("");
        setCode("");
        setCodes(data.recovery_codes);
        setMessage(
          action === "disable"
            ? "Authenticator disabled. Sign in again."
            : "Save these recovery codes privately. Each code works once. All previous sessions have ended.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
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
      <p className="auth-eyebrow">ACCOUNT SECURITY</p>
      <h1>Authenticator app</h1>
      {!status && !message && <p role="status">Loading security settings…</p>}
      {status && !status.available && (
        <p>Authenticator setup is unavailable. Contact your administrator.</p>
      )}
      {codes !== null ? (
        <>
          {codes.length > 0 && (
            <ul className="recovery-codes" aria-label="Recovery codes">
              {codes.map((value) => (
                <li key={value}>
                  <code>{value}</code>
                </li>
              ))}
            </ul>
          )}
          <p>
            <a href="/login">I have saved my codes — sign in again</a>
          </p>
        </>
      ) : (
        status?.available && (
          <>
            <p className="auth-intro">
              {status.enabled
                ? `Authenticator enabled. ${status.recovery_codes} recovery codes remaining.`
                : "Add a second step to protect your account."}
            </p>
            {secret && (
              <section>
                <p>
                  In your authenticator app, add a time-based account with this
                  setup key:
                </p>
                <code className="setup-secret">{secret}</code>
                <p>
                  <a href={uri}>Open in authenticator app</a>
                </p>
                <p>
                  Account: MAGPPIE CRM · 6 digits · 30 seconds. Enter a code
                  below to finish. Setup expires in 10 minutes.
                </p>
              </section>
            )}
            <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
              <label htmlFor="security-password">Current password</label>
              <input
                id="security-password"
                type="password"
                required
                maxLength={1024}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {(secret || status.enabled) && (
                <>
                  <label htmlFor="security-code">
                    {secret
                      ? "Authenticator code"
                      : "Authenticator or recovery code"}
                  </label>
                  <input
                    id="security-code"
                    required
                    maxLength={50}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </>
              )}
              {status.enabled && (
                <>
                  <label htmlFor="mfa-operation">Action</label>
                  <select
                    id="mfa-operation"
                    value={operation}
                    onChange={(e) => setOperation(e.target.value)}
                  >
                    <option value="recovery-codes">
                      Replace recovery codes
                    </option>
                    <option value="disable">Disable authenticator</option>
                  </select>
                  <p>
                    This ends all sessions. Replacing codes invalidates the old
                    set.
                  </p>
                </>
              )}
              <button disabled={busy}>
                {busy
                  ? "Please wait…"
                  : secret
                    ? "Enable authenticator"
                    : status.enabled
                      ? operation === "disable"
                        ? "Disable authenticator"
                        : "Replace recovery codes"
                      : "Set up authenticator"}
              </button>
            </form>
          </>
        )
      )}
      <p role="status" aria-live="polite">
        {message}
      </p>
      <p>
        <a href="/">Back to workspace</a> · <a href="/login">Sign in</a>
      </p>
    </main>
  );
}
