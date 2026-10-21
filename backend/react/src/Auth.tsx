import { useEffect, useRef, useState, type FormEvent } from "react";
import { MFAChallenge, AuthLayout, Spinner } from "./MFA";
import { signIn, signOut } from "./api";
export function HeaderSession() {
  const details = useRef<HTMLDetailsElement>(null);
  const [panel, setPanel] = useState<"" | "profile" | "settings">("");
  const [density, setDensity] = useState(() => {
    try {
      return localStorage.getItem("crm.ui.density") || "comfortable";
    } catch {
      return "comfortable";
    }
  });
  const [account, setAccount] = useState<{
    email: string;
    role: string;
  } | null>(null);
  const [accountError, setAccountError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Account unavailable");
        const value: unknown = await response.json();
        if (
          !value ||
          typeof value !== "object" ||
          !("email" in value) ||
          typeof value.email !== "string" ||
          !value.email.trim() ||
          !("role" in value) ||
          typeof value.role !== "string" ||
          !["admin", "reader", "assigned"].includes(value.role)
        )
          throw new Error("Account unavailable");
        if (!controller.signal.aborted)
          setAccount({ email: value.email, role: value.role });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccountError(true);
      });
    return () => controller.abort();
  }, []);
  const initials = account
    ? account.email
        .split("@")[0]
        .split(/[._+\-\s]+/)
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";
  useEffect(() => {
    document.documentElement.dataset.density = density;
    try {
      localStorage.setItem("crm.ui.density", density);
    } catch {
      /* Optional UI preference. */
    }
  }, [density]);
  useEffect(() => {
    function outside(e: PointerEvent) {
      if (!details.current?.contains(e.target as Node) && details.current)
        details.current.open = false;
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <details
      ref={details}
      className="header-session user-menu"
      onKeyDown={(e) => {
        if (e.key === "Escape" && details.current) {
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="User menu" title="Signed-in account and settings">
        <span className="user-avatar">{initials}</span>
      </summary>
      <div className="user-menu-panel">
        <div className="user-menu-identity">
          {account ? (
            <>
              <b>{account.email}</b>
              <span>{account.role}</span>
            </>
          ) : (
            <span role="status">
              {accountError
                ? "Account details unavailable"
                : "Loading account..."}
            </span>
          )}
        </div>
        <a href="/security">Account security</a>
        <button
          type="button"
          onClick={() => setPanel(panel === "profile" ? "" : "profile")}
          aria-expanded={panel === "profile"}
        >
          Profile
        </button>
        {panel === "profile" && (
          <section className="user-menu-info">
            <b>Signed-in account</b>
            <p>{account?.email || "Account details unavailable"}</p>
            {account && <p>{account.role}</p>}
            <p>Account details are managed by your administrator.</p>
          </section>
        )}
        <button
          type="button"
          onClick={() => setPanel(panel === "settings" ? "" : "settings")}
          aria-expanded={panel === "settings"}
        >
          Settings
        </button>
        {panel === "settings" && (
          <section className="user-menu-info">
            <label htmlFor="ui-density">Display spacing</label>
            <select
              id="ui-density"
              value={density}
              onChange={(e) => setDensity(e.target.value)}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
            <p>Saved on this browser only.</p>
          </section>
        )}
        <div className="user-menu-signout">
          <SignOut />
        </div>
      </div>
    </details>
  );
}
export function SignOut({
  navigate = (url: string) => location.assign(url),
}: {
  navigate?: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false),
    pending = useRef(false);
  async function logout() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await signOut();
      navigate("/login");
    } catch {
      setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      aria-live="polite"
      onClick={() => void logout()}
    >
      {busy ? "Signing out…" : failed ? "Sign out failed — retry" : "Sign out"}
    </button>
  );
}
export function Login({
  navigate = (url: string) => location.assign(url),
}: {
  navigate?: (url: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [signedIn, setSignedIn] = useState(false),
    [mfaRequired, setMfaRequired] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [capsLock, setCapsLock] = useState(false),
    pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) setSignedIn(r.ok);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("Signing in…");
    try {
      const result = await signIn(email, password);
      setPassword("");
      if (result.mfa_required) setMfaRequired(true);
      else navigate("/");
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
  if (mfaRequired) return <MFAChallenge navigate={navigate} />;
  return (
    <AuthLayout>
      <p className="auth-eyebrow">YOUR WORKSPACE</p>
      <h1>Welcome back</h1>
      <p className="auth-intro">Welcome back. Sign in to continue.</p>
      <form aria-busy={busy} onSubmit={(event) => void submit(event)}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          maxLength={320}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="auth-label-row">
          <label htmlFor="password">Password</label>
          <a href="/forgot-password">Forgot password?</a>
        </div>
        <div className="auth-password">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            aria-describedby="caps-lock"
            onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            onBlur={() => setCapsLock(false)}
            autoComplete="current-password"
            required
            maxLength={1024}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="auth-reveal"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <p id="caps-lock" className="auth-hint" role="status">
          {capsLock ? "Caps Lock is on." : ""}
        </p>
        <button id="submit" disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Signing in…" : "Log in"}
        </button>
        <p
          id="message"
          className="auth-feedback"
          role="alert"
          aria-live="polite"
        >
          {message}
        </p>
      </form>
      {signedIn && <SignOut navigate={navigate} />}
    </AuthLayout>
  );
}
