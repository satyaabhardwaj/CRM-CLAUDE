import { useEffect, useRef, useState, type FormEvent } from "react";
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
  const context = window as unknown as {
    Kit?: { headName?: () => string };
    People?: { list?: { role: string }[] };
  };
  const name = context.Kit?.headName?.() || "Workspace";
  const role = context.People?.list?.[0]?.role || "CRM";
  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
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
      <summary aria-label="User menu" title="Workspace profile and settings">
        <span className="user-avatar">{initials}</span>
      </summary>
      <div className="user-menu-panel">
        <div className="user-menu-identity">
          <b>{name}</b>
          <span>{role} - Workspace view</span>
        </div>
        <button
          type="button"
          onClick={() => setPanel(panel === "profile" ? "" : "profile")}
          aria-expanded={panel === "profile"}
        >
          Profile
        </button>
        {panel === "profile" && (
          <section className="user-menu-info">
            <b>Workspace profile</b>
            <p>
              {name} - {role}
            </p>
            <p>
              This is the workspace viewing context, not your sign-in identity.
              Account details are managed by your administrator.
            </p>
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
      await signIn(email, password);
      setPassword("");
      navigate("/");
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
      <p className="auth-eyebrow">YOUR WORKSPACE</p>
      <h1>MAGPPIE CRM</h1>
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
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button id="submit" disabled={busy}>
          {busy ? "Signing in…" : "Log in"}
        </button>
        <p id="message" role="alert" aria-live="polite">
          {message}
        </p>
      </form>
      {signedIn && <SignOut navigate={navigate} />}
      <footer className="auth-footer">MAGPPIE · Your team, connected</footer>
    </main>
  );
}
