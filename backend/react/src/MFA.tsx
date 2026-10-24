import { MIN_PASSWORD, MAX_PASSWORD } from "../../../shared/session";
import { safeNext } from "../../../shared/session";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

// Shared presentation shell; kept here to stay within the approved auth file scope.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <aside className="auth-brand" aria-label="MAGPPIE">
        <img
          className="auth-logo"
          src="data:image/png;base64,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"
          alt="MAGPPIE"
          width="1267"
          height="655"
        />
        <div className="auth-brand-copy">
          <p className="auth-eyebrow">Magppie CRM</p>
          <p className="auth-brand-title">
            Every kitchen, from first call <span>to handover.</span>
          </p>
          <p className="auth-brand-detail">
            Leads, designs, site visits and payments in one place for the whole
            team.
          </p>
          <ol className="auth-journey" aria-label="Order journey">
            {["Lead", "Design", "Measure", "Booking", "Handover"].map(
              (step) => (
                <li key={step}>{step}</li>
              ),
            )}
          </ol>
        </div>
        <KitchenArt />
        <p className="auth-brand-foot">
          Magppie Silverstone &middot; MAGPPIE CRM
        </p>
      </aside>
      <div className="auth-content">
        <main className="auth-card">
          <p className="auth-trust">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
            </svg>
            Secure sign-in
          </p>
          {children}
          <footer className="auth-footer">
            <span>&copy; {new Date().getFullYear()} Magppie</span>
            <span>Need help? Contact your workspace administrator.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
// Line drawing of a kitchen elevation for the brand panel; decorative only.
function KitchenArt() {
  return (
    <svg
      className="auth-art"
      viewBox="0 0 560 300"
      aria-hidden="true"
      focusable="false"
    >
      <g className="art-line">
        <path d="M20 268H540" />
        {/* wall cabinets either side of a window */}
        <rect x="40" y="40" width="130" height="72" rx="4" />
        <path d="M105 40v72M88 78h8M114 78h8" />
        <rect x="200" y="28" width="200" height="112" rx="3" />
        <path d="M300 28v112M200 84h200" />
        <rect x="430" y="40" width="90" height="72" rx="4" />
        <path d="M471 78h8" />
        {/* base run with worktop, oven and tap */}
        <rect x="32" y="152" width="496" height="10" rx="2" />
        <rect x="40" y="162" width="480" height="96" rx="3" />
        <path d="M150 162v96M410 162v96M90 200h20M440 200h20M480 200h20" />
        <path d="M160 172h240M160 200h240" />
        <path d="M250 214h100v34h-100zM262 228h76" />
        <path d="M292 152v-14a8 8 0 0 1 16 0" />
      </g>
      {/* pendant lights in front of the window */}
      <g className="art-accent">
        <path d="M240 0v84M300 0v84M360 0v84" />
        <path d="M226 98a14 14 0 0 1 28 0zM286 98a14 14 0 0 1 28 0zM346 98a14 14 0 0 1 28 0z" />
      </g>
      <g className="art-glow">
        <ellipse cx="240" cy="104" rx="20" ry="5" />
        <ellipse cx="300" cy="104" rx="20" ry="5" />
        <ellipse cx="360" cy="104" rx="20" ry="5" />
      </g>
    </svg>
  );
}
export function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

export function DigitCode({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  function fill(index: number, text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    const start = digits.length === 6 ? 0 : index;
    const next = Array.from({ length: 6 }, (_, i) => value[i] || " ");
    if (!digits) next[index] = " ";
    else
      for (let i = 0; i < digits.length && start + i < 6; i++)
        next[start + i] = digits[i];
    onChange(next.join("").trimEnd());
    if (digits) inputs.current[Math.min(start + digits.length, 5)]?.focus();
  }
  return (
    <fieldset className="auth-digits">
      <legend>Authenticator code</legend>
      <div>
        {Array.from({ length: 6 }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            aria-label={`Digit ${i + 1} of 6`}
            aria-describedby="challenge-hint"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            required
            pattern="[0-9]"
            value={(value[i] || "").trim()}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => fill(i, e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              fill(i, e.clipboardData.getData("text"));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !e.currentTarget.value && i > 0) {
                e.preventDefault();
                fill(i - 1, "");
                inputs.current[i - 1]?.focus();
              }
              if (e.key === "ArrowLeft" && i > 0) {
                e.preventDefault();
                inputs.current[i - 1]?.focus();
              }
              if (e.key === "ArrowRight" && i < 5) {
                e.preventDefault();
                inputs.current[i + 1]?.focus();
              }
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

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
      navigate(
        safeNext(new URLSearchParams(location.search).get("next")) || "/",
      );
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
    <AuthLayout>
      <p className="auth-eyebrow">MAGPPIE CRM</p>
      <h1>Verify your sign-in</h1>
      <p className="auth-intro">
        {backup
          ? "Enter one unused recovery code."
          : "Enter the six-digit code from your authenticator app."}
      </p>
      <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
        {backup ? (
          <>
            <label htmlFor="mfa-code">Recovery code</label>
            <input
              id="mfa-code"
              autoComplete="one-time-code"
              inputMode="text"
              required
              maxLength={50}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        ) : (
          <DigitCode value={code} onChange={setCode} />
        )}
        <button disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
      <p className="auth-feedback" role="alert" aria-live="polite">
        {message}
      </p>
      <p id="challenge-hint" className="auth-hint">
        Your verification challenge expires 5 minutes after sign-in. If it has
        expired, start sign-in again.
      </p>
      <button
        type="button"
        className="auth-secondary"
        disabled={busy}
        onClick={() => {
          setBackup(!backup);
          setCode("");
          setMessage("");
        }}
      >
        {backup ? "Use authenticator app" : "Use a recovery code instead"}
      </button>
      <p>
        <a href="/login">Back to sign in</a>
      </p>
    </AuthLayout>
  );
}

export function Security() {
  const [status, setStatus] = useState<{
    available: boolean;
    enabled: boolean;
    recovery_codes: number;
    required?: boolean;
    must_change_password?: boolean;
  } | null>(null);
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [exportMessage, setExportMessage] = useState("");
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
  async function copyCodes() {
    try {
      await navigator.clipboard.writeText((codes || []).join("\n"));
      setExportMessage(
        "Codes copied. Store them privately and clear your clipboard afterwards.",
      );
    } catch {
      setExportMessage(
        "Could not copy. Select the codes and copy them manually.",
      );
    }
  }
  function downloadCodes() {
    try {
      const url = URL.createObjectURL(
        new Blob(
          [
            "MAGPPIE recovery codes - keep private\n" +
              (codes || []).join("\n"),
          ],
          { type: "text/plain" },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "magppie-recovery-codes.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage("Download requested. Keep the file in a safe place.");
    } catch {
      setExportMessage("Download unavailable. Save the codes manually.");
    }
  }
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
    <AuthLayout>
      <p className="auth-eyebrow">ACCOUNT SECURITY</p>
      <h1>Authenticator app</h1>
      <ol className="auth-steps" aria-label="Authenticator setup steps">
        <li
          aria-current={
            codes === null && !secret && !status?.enabled ? "step" : undefined
          }
        >
          1 - Scan / enter key
        </li>
        <li aria-current={secret ? "step" : undefined}>2 - Enter code</li>
        <li aria-current={codes && codes.length > 0 ? "step" : undefined}>
          3 - Save recovery codes
        </li>
      </ol>
      {!status && !message && <p role="status">Loading security settings…</p>}
      {status && !status.available && (
        <p>Authenticator setup is unavailable. Contact your administrator.</p>
      )}
      {status?.required && !status.enabled && codes === null && (
        <p className="auth-notice" role="alert">
          Administrator accounts must use an authenticator app. Set it up to
          open the workspace.
        </p>
      )}
      {codes !== null ? (
        <>
          {codes.length > 0 && (
            <>
              <p className="auth-notice">
                These codes are shown once. Save them privately before leaving
                this page. Each code works only once.
              </p>
              <ul className="recovery-codes" aria-label="Recovery codes">
                {codes.map((value) => (
                  <li key={value}>
                    <code>{value}</code>
                  </li>
                ))}
              </ul>
              <div className="auth-code-actions">
                <button
                  type="button"
                  className="auth-secondary"
                  onClick={() => void copyCodes()}
                >
                  Copy recovery codes
                </button>
                <button
                  type="button"
                  className="auth-secondary"
                  onClick={downloadCodes}
                >
                  Download codes
                </button>
              </div>
              <p role="status">{exportMessage}</p>
            </>
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
              <section className="auth-setup">
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
                    {!status.required && (
                      <option value="disable">Disable authenticator</option>
                    )}
                  </select>
                  <p>
                    This ends all sessions. Replacing codes invalidates the old
                    set.
                    {status.required &&
                      " Administrator accounts cannot disable the authenticator."}
                  </p>
                </>
              )}
              <button disabled={busy}>
                {busy && <Spinner />}
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
      <p className="auth-feedback" role="status" aria-live="polite">
        {message}
      </p>
      {status?.must_change_password && codes === null && (
        <p className="auth-notice" role="alert">
          You signed in with a temporary password. Choose your own below to open
          the workspace.
        </p>
      )}
      {status &&
        codes === null &&
        !secret &&
        (status.enabled || !status.required || !status.available) && (
          <ChangePassword needsCode={status.enabled} />
        )}
      <p>
        <a href="/">Back to workspace</a> · <a href="/login">Sign in</a>
      </p>
    </AuthLayout>
  );
}

export function ChangePassword({ needsCode }: { needsCode: boolean }) {
  const [password, setPassword] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (next.length < MIN_PASSWORD)
      return setMessage(
        `Use at least ${MIN_PASSWORD} characters for the new password.`,
      );
    if (next !== again) return setMessage("The new passwords do not match.");
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          needsCode
            ? { password, new_password: next, code }
            : { password, new_password: next },
        ),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Password change unavailable. Try again.",
        );
      setPassword("");
      setNext("");
      setAgain("");
      setCode("");
      setMessage(
        "Password changed. You stay signed in here; every other session has ended.",
      );
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
    <section
      className="auth-change-password"
      aria-labelledby="password-heading"
    >
      <h2 id="password-heading">Change password</h2>
      <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
        <label htmlFor="password-current">Current password</label>
        <input
          id="password-current"
          type="password"
          required
          maxLength={1024}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label htmlFor="password-new">New password</label>
        <input
          id="password-new"
          type="password"
          required
          minLength={MIN_PASSWORD}
          maxLength={MAX_PASSWORD}
          autoComplete="new-password"
          aria-describedby="password-rule"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <p id="password-rule" className="auth-hint">
          At least {MIN_PASSWORD} characters, different from the current one.
        </p>
        <label htmlFor="password-again">Repeat new password</label>
        <input
          id="password-again"
          type="password"
          required
          maxLength={MAX_PASSWORD}
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
        {needsCode && (
          <>
            <label htmlFor="password-code">
              Authenticator or recovery code
            </label>
            <input
              id="password-code"
              required
              maxLength={50}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        )}
        <button disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Please wait…" : "Change password"}
        </button>
      </form>
      <p className="auth-feedback" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
