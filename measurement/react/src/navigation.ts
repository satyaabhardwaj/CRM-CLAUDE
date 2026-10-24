import type { VisitType } from "./visits";

// Keep the visit type in the link: one client can have several open visits.
export function notificationHash(clientId: string, text: string) {
  const target = /site details|site address|client number|supervisor/i.test(
    text,
  )
    ? "site"
    : /ept[\s_-]*verification/i.test(text)
      ? "eptVerification"
      : /ept[\s_-]*marking/i.test(text)
        ? "eptMarking"
        : /\bpdi\b/i.test(text)
          ? "pdi"
          : /first|site measurement|measurement before|special approval/i.test(
                text,
              )
            ? "first"
            : "";
  return (
    "crm/visits/" + encodeURIComponent(clientId) + (target ? "/" + target : "")
  );
}

export function focusOf(hash: string): {
  id: string;
  type?: VisitType;
  site?: boolean;
} {
  const match =
    /^#crm\/visits\/([^/]+)(?:\/(first|eptMarking|eptVerification|pdi|site))?$/.exec(
      hash,
    );
  if (!match) return { id: "" };
  try {
    return {
      id: decodeURIComponent(match[1]),
      type:
        match[2] === "site" ? undefined : (match[2] as VisitType | undefined),
      site: match[2] === "site",
    };
  } catch {
    return { id: "" };
  }
}
