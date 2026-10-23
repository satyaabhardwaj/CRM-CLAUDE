import { clearDrafts, loginUrl } from "../../../shared/session";
export async function signIn(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(20000),
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "Could not sign in.",
    );
  const record = (data && typeof data === "object" ? data : {}) as Record<
    string,
    unknown
  >;
  return {
    mfa_required: record.mfa_required === true,
    // "email": a sign-in code was emailed to `to` (masked); otherwise the authenticator app.
    method: record.method === "email" ? ("email" as const) : ("app" as const),
    to: typeof record.to === "string" ? record.to : "",
  };
}
export async function signOut() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Sign out failed — retry");
  clearDrafts();
}
export function installSessionRedirect(
  target: Pick<Window, "fetch">,
  navigate: (url: string) => void,
) {
  const original = target.fetch.bind(target);
  let leaving = false;
  target.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    // Let the module keep its unsaved draft first; then go to sign-in and come back here after.
    if (response.status === 401) {
      if (!leaving) {
        leaving = true;
        setTimeout(() => navigate(loginUrl("ended")), 150);
      }
    }
    // Admin MFA policy: an unenrolled admin is sent to account security.
    else if (response.status === 403) {
      const data: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      if (
        data &&
        typeof data === "object" &&
        (("mfa_enrollment_required" in data &&
          data.mfa_enrollment_required === true) ||
          ("password_change_required" in data &&
            data.password_change_required === true))
      )
        navigate("/security");
    }
    return response;
  };
  return () => {
    target.fetch = original;
  };
}
