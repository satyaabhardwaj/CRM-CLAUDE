import { useCallback, useEffect, useRef, useState } from "react";
import { useCardLabels } from "../../../backend/react/src/Shell";
import { ROLE_LABEL } from "../../../shared/session";

// Admin-only staff accounts (owner decision, 22 Oct 2026). The server checks everything again:
// administrator with an authenticator, never deletes, never removes the last administrator.
export interface StaffUser {
  id: string;
  email: string | null;
  role: string;
  active: boolean;
  mfa: boolean;
  last_login: number | null;
  must_change_password: boolean;
}
type Confirm =
  | { kind: "deactivate" | "reset"; user: StaffUser }
  | { kind: "role"; user: StaffUser; role: string };

async function call(path: string, body?: object) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "The change was not confirmed. Please retry.";
    throw new Error(error);
  }
  return data as Record<string, unknown>;
}

const when = (seconds: number | null) =>
  seconds
    ? new Date(seconds * 1000).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Never";

export function UsersPage() {
  const [list, setList] = useState<StaffUser[] | null>(null),
    [roles, setRoles] = useState<string[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [secret, setSecret] = useState<{ email: string; password: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("sales"),
    [confirm, setConfirm] = useState<Confirm | null>(null);
  const table = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    yes = useRef<HTMLButtonElement>(null);
  useCardLabels(table);

  const load = useCallback(async () => {
    try {
      const data = await call("/api/admin/users");
      setList(data.users as StaffUser[]);
      setRoles(data.roles as string[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Users could not be loaded.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (confirm && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
      yes.current?.focus();
    } else if (!confirm && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [confirm]);

  async function act(
    run: () => Promise<Record<string, unknown>>,
    done: string,
    who?: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await run();
      if (typeof data.temporary_password === "string" && who)
        setSecret({ email: who, password: data.temporary_password });
      setNotice(done);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The change was not confirmed.",
      );
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  const label = (id: string) => ROLE_LABEL[id] || id;
  const nextRole = confirm?.kind === "role" ? confirm.role : "";
  const roleOptions = roles.map((id) => (
    <option key={id} value={id}>
      {label(id)}
    </option>
  ));

  return (
    <div className="mg management-users">
      <section className="card management-user-add">
        <h2>Add a person</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const who = email.trim().toLowerCase();
            void act(
              () => call("/api/admin/users", { email: who, role }),
              "Added. Give them the temporary password privately; they choose their own at first sign-in.",
              who,
            ).then(() => setEmail(""));
          }}
        >
          <label>
            <span>Email</span>
            <input
              type="email"
              required
              maxLength={320}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roleOptions}
            </select>
          </label>
          <button className="btn dark" disabled={busy}>
            Add person
          </button>
        </form>
      </section>
      {secret && (
        <section className="card management-secret" role="status">
          <p>
            Temporary password for <b>{secret.email}</b>. It is shown only now;
            give it to them privately. They must choose their own at the next
            sign-in.
          </p>
          <code>{secret.password}</code>
          <div className="management-secret-actions">
            <button
              type="button"
              className="btn"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(secret.password)
                  .then(() =>
                    setNotice(
                      "Copied. Clear your clipboard after handing it over.",
                    ),
                  )
                  .catch(() =>
                    setNotice(
                      "Copy unavailable; select the password and copy it.",
                    ),
                  )
              }
            >
              Copy
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSecret(null)}
            >
              Done, hide it
            </button>
          </div>
        </section>
      )}
      <p className="management-users-status" role={error ? "alert" : "status"}>
        {error || notice}
        {error.includes("authenticator") && (
          <>
            {" "}
            <a href="/security">Open Account security</a>
          </>
        )}
      </p>
      <section className="card management-table">
        <div className="management-scroll cardify" ref={table}>
          <div className="row head management-user-row">
            {[
              "Person",
              "Role",
              "Status",
              "Authenticator",
              "Last sign-in",
              "Actions",
            ].map((t) => (
              <div key={t}>{t}</div>
            ))}
          </div>
          {!list && !error && <div className="row">Loading people…</div>}
          {list?.map((u) => (
            <div
              key={u.id}
              className={
                "row management-user-row" + (u.active ? "" : " is-inactive")
              }
            >
              <span>
                <b>{u.email || u.id}</b>
                {u.must_change_password && (
                  <span className="sub"> · must choose a new password</span>
                )}
              </span>
              <span>
                <select
                  aria-label={"Role for " + (u.email || u.id)}
                  value={u.role}
                  disabled={busy}
                  onChange={(e) =>
                    setConfirm({ kind: "role", user: u, role: e.target.value })
                  }
                >
                  {roleOptions}
                </select>
              </span>
              <span>
                <i className={"pill " + (u.active ? "green" : "grey")}>
                  {u.active ? "Active" : "Deactivated"}
                </i>
              </span>
              <span>{u.mfa ? "On" : "Off"}</span>
              <span>{when(u.last_login)}</span>
              <span className="management-user-actions">
                <button
                  type="button"
                  className="btn small"
                  disabled={busy || !u.email}
                  onClick={() => setConfirm({ kind: "reset", user: u })}
                >
                  Reset password
                </button>
                {u.active ? (
                  <button
                    type="button"
                    className="btn small warn"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: "deactivate", user: u })}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn small"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          call(
                            `/api/admin/users/${encodeURIComponent(u.id)}/reactivate`,
                            {},
                          ),
                        "Reactivated.",
                      )
                    }
                  >
                    Reactivate
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
      <dialog
        ref={dialog}
        className="management-confirm"
        role="alertdialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-text"
        onCancel={(e) => {
          e.preventDefault();
          setConfirm(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setConfirm(null);
          }
        }}
      >
        {confirm && (
          <>
            <h2 id="confirm-title">
              {confirm.kind === "deactivate"
                ? "Deactivate this person?"
                : confirm.kind === "reset"
                  ? "Reset this password?"
                  : "Change this role?"}
            </h2>
            <p id="confirm-text">
              {confirm.kind === "deactivate"
                ? `${confirm.user.email} is signed out everywhere at once and cannot sign in until reactivated. Nothing is deleted.`
                : confirm.kind === "reset"
                  ? `${confirm.user.email} is signed out everywhere and gets a temporary password, shown once here. Their authenticator stays as it is.`
                  : `${confirm.user.email} becomes ${label(nextRole)} and is signed out so every screen starts with the new access.`}
            </p>
            <div className="management-confirm-actions">
              <button
                ref={yes}
                type="button"
                className={
                  "btn " + (confirm.kind === "deactivate" ? "warn" : "dark")
                }
                disabled={busy}
                onClick={() => {
                  const u = confirm.user,
                    path = `/api/admin/users/${encodeURIComponent(u.id)}`;
                  if (confirm.kind === "deactivate")
                    void act(
                      () => call(path + "/deactivate", {}),
                      "Deactivated and signed out everywhere.",
                    );
                  else if (confirm.kind === "reset")
                    void act(
                      () => call(path + "/reset-password", {}),
                      "Password reset.",
                      u.email || u.id,
                    );
                  else
                    void act(
                      () => call(path + "/role", { role: nextRole }),
                      "Role changed.",
                    );
                }}
              >
                {confirm.kind === "deactivate"
                  ? "Deactivate"
                  : confirm.kind === "reset"
                    ? "Reset password"
                    : "Change role"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
