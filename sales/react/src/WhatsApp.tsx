import { useEffect, useRef, useState } from "react";
import type { FormProps } from "./model";
import { Button, now } from "./ui";
const HELPER = "http://127.0.0.1:47321";
export function whatsappNumber(phone: string) {
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length === 10 ? "91" + digits : digits;
}
interface Health {
  whatsappOpen?: boolean;
  updated?: boolean;
  version?: string;
  knownVersion?: string;
  problems?: string[];
  sent?: number;
  suspect?: number;
  failed?: number;
}
async function helperRequest(path: string, init?: RequestInit) {
  const response = await fetch(HELPER + path, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error("The WhatsApp helper could not complete this action.");
  return response;
}
export function WhatsApp({ c, ctx }: FormProps) {
  const supported = location.hostname === "magppie-crm-helper.vercel.app";
  const framed = window.top !== window.self;
  const [message, setMessage] = useState(""),
    [helper, setHelper] = useState(false),
    [health, setHealth] = useState<Health | null>(null),
    [lost, setLost] = useState(false),
    [showHealth, setShowHealth] = useState(false),
    [mirror, setMirror] = useState(false),
    [hidden, setHidden] = useState(false),
    [stream, setStream] = useState<MediaStream | null>(null),
    [frame, setFrame] = useState(""),
    [text, setText] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    active = useRef(true),
    currentStream = useRef<MediaStream | null>(null);
  currentStream.current = stream;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      currentStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function poll() {
    try {
      await helperRequest("/ping");
      const data = (await (await helperRequest("/health")).json()) as Health;
      if (active.current) {
        setHelper(true);
        setHealth(data);
        setLost(false);
      }
    } catch {
      if (active.current) {
        setHelper(false);
        setLost(true);
      }
    }
  }
  useEffect(() => {
    if (!supported || !/Windows/i.test(navigator.userAgent)) return;
    void poll();
    const timer = setInterval(() => void poll(), 30000);
    return () => clearInterval(timer);
  }, [supported]);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream, hidden]);
  useEffect(() => {
    if (!mirror || hidden || !helper || busy) return;
    let cancelled = false,
      url = "",
      timer: ReturnType<typeof setTimeout>;
    async function pull() {
      try {
        const blob = await (await helperRequest("/frame")).blob();
        if (!cancelled) {
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          setFrame(url);
        }
      } catch {
        if (!cancelled)
          setMessage("No picture from WhatsApp. Check that the app is open.");
      }
      if (!cancelled) timer = setTimeout(() => void pull(), 350);
    }
    void pull();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [mirror, hidden, helper, busy]);
  const number = whatsappNumber(c.phone || ""),
    link =
      number.length >= 11 ? "whatsapp://send?phone=" + number : "whatsapp://";
  async function open() {
    if (framed) {
      if (!number) {
        setMessage("Add the client's phone number first.");
        return;
      }
      try {
        await navigator.clipboard.writeText("+" + number);
        setMessage(
          "Number copied: +" +
            number +
            ". Open WhatsApp and paste it in search.",
        );
      } catch {
        setMessage("Copy this number into WhatsApp: +" + number);
      }
      return;
    }
    if (supported && helper) {
      try {
        await helperRequest("/open?phone=" + encodeURIComponent(number));
        setMirror(true);
        setHidden(false);
      } catch (error) {
        setMessage((error as Error).message);
      }
      return;
    }
    if (supported && !stream && navigator.mediaDevices?.getDisplayMedia) {
      try {
        const media = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        if (!active.current) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        media.getVideoTracks()[0].addEventListener("ended", () => {
          setStream(null);
          setMirror(false);
        });
        setStream(media);
        setMirror(true);
        setHidden(false);
      } catch {
        /* Sharing is optional; the app link still works. */
      }
    }
    location.href = link;
  }
  async function send() {
    if (busy || ctx.readOnly || (!text.trim() && !files.length)) return;
    if (number.length < 11) {
      setMessage("Add the client's phone number first.");
      return;
    }
    if (!helper) {
      if (files.length) {
        setMessage(
          "Files go only through the WhatsApp helper on a Windows PC.",
        );
        return;
      }
      location.href = link + "&text=" + encodeURIComponent(text.trim());
      setMessage("In WhatsApp now: press Enter there to send.");
      setText("");
      return;
    }
    setBusy(true);
    setMessage("Sending...");
    try {
      const ids: string[] = [];
      for (const file of files)
        ids.push(
          (
            await (
              await helperRequest(
                "/stage?name=" + encodeURIComponent(file.name),
                { method: "POST", body: file },
              )
            ).text()
          ).trim(),
        );
      await helperRequest(
        "/send?phone=" +
          number +
          "&text=" +
          encodeURIComponent(text.trim()) +
          "&files=" +
          ids.map(encodeURIComponent).join(","),
      );
      const note =
        text.trim() +
        (files.length
          ? " · Files: " + files.map((f) => f.name).join(", ")
          : "");
      ctx.update(() =>
        c.contacts.unshift({
          at: now(),
          type: "WhatsApp",
          outcome: "Message sent",
          next: "",
          note,
        }),
      );
      setText("");
      setFiles([]);
      setMessage("Sent.");
    } catch {
      setMessage(
        "Send was not confirmed. Check WhatsApp before retrying; the message may already have been sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  const problems = [
    ...(health?.problems || []),
    ...(lost ? ["The WhatsApp helper on this PC did not answer."] : []),
    ...(health && !health.whatsappOpen
      ? ["WhatsApp is not open on this PC."]
      : []),
    ...(health?.updated
      ? ["WhatsApp updated. Send one test message, then mark it as checked."]
      : []),
  ];
  return (
    <>
      <Button tone="small line" onClick={() => void open()}>
        {framed ? "Copy WhatsApp number" : "WhatsApp"}
      </Button>
      {message && (
        <span role="status" className="hint">
          {message}
        </span>
      )}
      {supported && (
        <>
          <Button tone="small line" onClick={() => setShowHealth(!showHealth)}>
            WhatsApp{" "}
            {problems.length ? ": " + problems.length + " problem(s)" : "OK"}
          </Button>
          {showHealth && (
            <section className="card card-b" aria-label="WhatsApp health">
              <b>WhatsApp health</b>
              <div>
                Sent {health?.sent || 0} · may not have gone{" "}
                {health?.suspect || 0} · failed {health?.failed || 0} ·{" "}
                {health?.version}
              </div>
              {problems.map((p) => (
                <p key={p}>{p}</p>
              ))}
              {health?.updated && (
                <Button
                  onClick={() =>
                    void helperRequest("/ackversion")
                      .then(poll)
                      .catch(() =>
                        setMessage("Could not acknowledge this update."),
                      )
                  }
                >
                  Mark WhatsApp update as checked
                </Button>
              )}
              <Button onClick={() => setShowHealth(false)}>Close</Button>
            </section>
          )}
          {mirror && hidden && (
            <Button onClick={() => setHidden(false)}>
              Show WhatsApp mirror
            </Button>
          )}
          {mirror && !hidden && (
            <section className="card card-b sales-whatsapp-mirror">
              <div className="flexrow">
                <b>WhatsApp · live mirror · type in the WhatsApp app</b>
                <Button onClick={() => setHidden(true)}>Show the form</Button>
                <Button
                  onClick={() => {
                    stream?.getTracks().forEach((t) => t.stop());
                    setStream(null);
                    setMirror(false);
                  }}
                >
                  Stop mirror
                </Button>
              </div>
              {helper ? (
                <img src={frame || undefined} alt="WhatsApp" />
              ) : (
                <video ref={video} autoPlay muted playsInline />
              )}
              <input
                aria-label="WhatsApp message"
                value={text}
                disabled={busy || ctx.readOnly}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void send();
                }}
              />
              {helper && (
                <label>
                  Attach
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*,application/pdf"
                    disabled={busy || ctx.readOnly}
                    onChange={(e) => {
                      const chosen = [
                        ...files,
                        ...Array.from(e.target.files || []),
                      ];
                      e.target.value = "";
                      if (
                        chosen.reduce((n, f) => n + f.size, 0) >
                        100 * 1024 * 1024
                      ) {
                        setMessage(
                          "Together these are over 100 MB. Send fewer or smaller files.",
                        );
                        return;
                      }
                      setFiles(chosen.slice(0, 10));
                      if (chosen.length > 10)
                        setMessage("Up to 10 files at a time.");
                    }}
                  />
                </label>
              )}
              {files.map((file, i) => (
                <Button
                  key={i}
                  disabled={busy}
                  onClick={() => setFiles(files.filter((_, j) => i !== j))}
                >
                  Remove {file.name}
                </Button>
              ))}
              <Button
                disabled={busy || ctx.readOnly}
                onClick={() => void send()}
              >
                Send to WhatsApp
              </Button>
            </section>
          )}
        </>
      )}
    </>
  );
}
