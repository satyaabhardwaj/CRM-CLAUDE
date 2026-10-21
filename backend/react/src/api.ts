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
}
export async function signOut() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Sign out failed — retry");
}
export function installSessionRedirect(
  target: Pick<Window, "fetch">,
  navigate: (url: string) => void,
) {
  const original = target.fetch.bind(target);
  target.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    if (response.status === 401) navigate("/login");
    return response;
  };
  return () => {
    target.fetch = original;
  };
}
