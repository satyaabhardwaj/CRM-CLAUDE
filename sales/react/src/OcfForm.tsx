import { useState } from "react";
import type { FormProps, SalesClient } from "./model";
import { rules } from "./model";
import { Button, Card, day, FileLink, now, Pill } from "./ui";
import { news } from "./commands";
import { uploadTemporary } from "../../../shared/uploads";
export async function signRequest(
  url: string,
  body?: unknown,
): Promise<SignResponse> {
  if (
    url === "/api/sign/send" &&
    body &&
    typeof body === "object" &&
    "pdf" in body &&
    typeof body.pdf === "string" &&
    body.pdf.length > 3 * 1024 * 1024
  ) {
    const bytes = Uint8Array.from(atob(body.pdf), (c) => c.charCodeAt(0));
    const upload = await uploadTemporary(
      new Blob([bytes], { type: "application/pdf" }),
    );
    body = { ...body, pdf: undefined, upload };
  }
  const r = await fetch(url, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(30000),
  });
  const result: SignResponse = await r.json();
  if (!r.ok || result.error)
    throw Error(
      result.error === "no key"
        ? "Zoho Sign is not configured yet."
        : result.error || "Signature request failed. Please retry.",
    );
  return result;
}
export interface SignResponse {
  id?: string;
  status?: string;
  name?: string;
  sent_to?: string[];
  test?: boolean;
  people?: { name: string; status: string }[];
  error?: string;
  on?: boolean;
}
export function signingBody(c: SalesClient) {
  if (!c.email)
    throw Error("Add the client's email first (Names and phones, Email).");
  const form = window.OCF.forSigning(c);
  if (!form) throw Error("The OCF could not be made. Reload and try again.");
  return {
    ...form,
    title: "Order Closure Form · " + c.name + " · " + c.pid,
    name: c.person || c.name,
    email: c.email,
  };
}
export function recordSignature(
  c: SalesClient,
  out: SignResponse,
  filename: string,
  auto = false,
) {
  if (!out.id)
    throw Error(
      "The signature request was not confirmed. Check Zoho Sign before sending again.",
    );
  c.ocfSign = {
    id: out.id,
    status: "inprogress",
    sentAt: now(),
    to: out.sent_to,
    test: !!out.test,
    filename,
    auto,
  };
  c.ocfAsked = true;
  c.ocfAt ||= now();
  news(
    c,
    auto
      ? "OCF sent for signature by itself, as the token is in"
      : "OCF sent for signature",
  );
}
export function OcfForm({ c, ctx }: FormProps) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    s = c.ocfSign;
  async function send() {
    if (busy) return;
    setBusy(true);
    setMessage("Sending to Zoho Sign…");
    try {
      const body = signingBody(c),
        out = await signRequest("/api/sign/send", body);
      if (!out.id)
        throw Error(
          "The send was not confirmed. Check Zoho Sign before sending again.",
        );
      ctx.update(() => recordSignature(c, out, body.filename));
      setMessage(
        out.test
          ? "Test mode: sent to the test address, not to the client."
          : "Sent for signature.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Send was not confirmed. Check Zoho Sign before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!s || busy) return;
    setBusy(true);
    setMessage("Asking Zoho Sign…");
    try {
      const out = await signRequest(
        "/api/sign/status?id=" + encodeURIComponent(s.id),
      );
      if (!out.status) throw Error("Signature status was not returned.");
      const got =
        out.status === "completed" && !s.file
          ? await signRequest("/api/sign/fetch", {
              id: s.id,
              owner: c.id,
              filename: s.filename,
            })
          : null;
      ctx.update(() => {
        s.status = out.status!;
        s.people = out.people;
        s.checkedAt = now();
        if (got?.name) {
          s.file = got.name;
          s.signedAt = now();
          news(c, "OCF signed by the client", "green");
        }
      });
      setMessage(
        got && !got.name
          ? "The signed copy could not be fetched. Please check again."
          : "Status updated.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not check signature.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="6 · OCF">
      <p>
        The Order Closure Form is made as a PDF in the company format: client
        and billing details, the dates, the product table, payment stages, terms
        and signature lines.
      </p>
      {c.ocfAt && (
        <p className="hint">
          OCF made on {day(c.ocfAt)}. The drawing signoff counts from this date.
        </p>
      )}
      {!rules().totals(c).total && (
        <p className="msg">Fill the order value first.</p>
      )}
      <div className="soft">
        <div className="line">
          <b>Signature · Zoho Sign</b>
          <Pill tone={s?.status === "completed" ? "green" : "blue"}>
            {s
              ? (
                  {
                    inprogress: "Waiting for signature",
                    completed: "Signed",
                    declined: "Declined",
                    recalled: "Recalled",
                    expired: "Expired",
                  } as Record<string, string>
                )[s.status] || s.status
              : "Not sent"}
          </Pill>
        </div>
        {s ? (
          <p className="sub">
            Sent {day(s.sentAt)} to {(s.to || []).join(", ")}
            {s.test && " · test mode"}
            {s.checkedAt && " · last checked " + day(s.checkedAt)}
          </p>
        ) : (
          <p className="sub">
            The client gets an email and signs on their phone or laptop.
          </p>
        )}
        {s?.people && (
          <p>
            {s.people
              .map((p) => p.name + ": " + p.status.toLowerCase())
              .join(" · ")}
          </p>
        )}
        {s?.file && (
          <p>
            Signed copy: <FileLink owner={c.id} name={s.file} />
          </p>
        )}
        {(message || (!s && c.ocfSignProblem)) && (
          <p className="msg" role="status">
            {message || c.ocfSignProblem}
          </p>
        )}
        <p className="sub">
          {s?.auto
            ? "Sent by itself when the token came in."
            : !s
              ? "Once Zoho Sign is switched on, this is sent by itself as soon as the token is in."
              : ""}
        </p>
        <div className="flexrow">
          <Button
            tone="dark"
            disabled={busy || !rules().totals(c).total}
            onClick={() => void send()}
          >
            {s ? "Send again" : "Send for signature"}
          </Button>
          {s && (s.status !== "completed" || !s.file) && (
            <Button disabled={busy} onClick={() => void check()}>
              Check status
            </Button>
          )}
        </div>
      </div>
      <Button
        tone="dark"
        disabled={!rules().totals(c).total || busy}
        onClick={() => {
          ctx.update(() => {
            if (!c.ocfAt)
              news(c, "OCF made · drawing signoff counts from today", "green");
            c.ocfAsked = true;
            c.ocfAt ||= now();
          });
          window.OCF.make(c);
        }}
      >
        {c.ocfAt ? "Download OCF again" : "Generate OCF"}
      </Button>
    </Card>
  );
}
