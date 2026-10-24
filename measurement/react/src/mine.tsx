// A measurement person's own page, opened on the phone at /my-visits (Manish, 23 Oct 2026).
// Only their visits; for each one the drawing, Google location, site address and the site supervisor's number.
// They accept or decline, tick the checklist with photos (EPT verification and PDI), list snags, and mark it done.
import { useCallback, useEffect, useState } from "react";
import {
  api,
  late,
  StatusPill,
  TypeChip,
  typeName,
  type Item,
  type Visit,
} from "./visits";

interface Mine {
  member: { id: string; name: string };
  visits: {
    client: {
      id: string;
      name: string;
      pid?: string;
      city?: string;
      pin?: string;
      siteAddress?: string;
      siteContact?: string;
      designer?: string;
      drawing?: string;
      site: {
        location?: string;
        supervisor?: string;
        supervisorPhone?: string;
        clientPhone?: string;
      };
    };
    visit: Visit;
    lead: boolean;
  }[];
  checklists: { eptMarking: Item[]; eptVerification: Item[]; pdi: Item[] };
  pdiFields: Item[];
}

export function MyVisits() {
  const [data, setData] = useState<Mine | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(""),
    [showDone, setShowDone] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<Mine>("/api/measurement/mine"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your visits.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (error && !data)
    return (
      <main className="mine">
        <section className="card m-status" role="alert">
          <h1>My visits</h1>
          <p>{error}</p>
          <button className="btn dark" onClick={() => void load()}>
            Try again
          </button>
        </section>
      </main>
    );
  if (!data)
    return (
      <main className="mine">
        <p className="react-empty">Loading your visits…</p>
      </main>
    );
  const active = data.visits.filter(
    (x) => !["done", "declined"].includes(x.visit.status),
  );
  const done = data.visits.filter((x) =>
    ["done", "declined"].includes(x.visit.status),
  );
  const list = (showDone ? done : active).sort((a, b) =>
    (a.visit.date || "9999").localeCompare(b.visit.date || "9999"),
  );
  const current = data.visits.find((x) => x.visit.id === open);
  return (
    <main className="mine">
      <header className="mine-head">
        <div>
          <b>MAGPPIE</b> · My visits
        </div>
        <span className="sub">{data.member.name}</span>
      </header>
      {current ? (
        <VisitView
          item={current}
          data={data}
          onBack={() => {
            setOpen("");
            void load();
          }}
        />
      ) : (
        <>
          <div className="mine-tabs" role="tablist">
            <button
              className={!showDone ? "on" : ""}
              onClick={() => setShowDone(false)}
            >
              To do ({active.length})
            </button>
            <button
              className={showDone ? "on" : ""}
              onClick={() => setShowDone(true)}
            >
              Done ({done.length})
            </button>
          </div>
          <div className="rows">
            {list.length ? (
              list.map(({ client: c, visit: v, lead }) => (
                <button
                  key={v.id}
                  className="row react-row mine-row"
                  onClick={() => setOpen(v.id)}
                >
                  <span>
                    <strong>{c.name}</strong> <TypeChip type={v.type} />
                    {v.revisit && (
                      <span className="vt vt-revisit">Revisit</span>
                    )}
                    <span className="sub">
                      {[
                        v.date || "No date yet",
                        c.city,
                        lead ? "" : "you go along with " + v.assigneeName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <StatusPill v={v} />
                </button>
              ))
            ) : (
              <p className="react-empty">
                {showDone
                  ? "Nothing done yet."
                  : "No visits for you right now."}
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function VisitView({
  item,
  data,
  onBack,
}: {
  item: Mine["visits"][number];
  data: Mine;
  onBack: () => void;
}) {
  const { client: c, visit, lead } = item;
  const [v, setV] = useState<Visit>(visit),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [snag, setSnag] = useState(""),
    [reason, setReason] = useState("");
  const list = data.checklists[v.type as keyof Mine["checklists"]] || [];
  const closed = ["done", "declined", "cancelled"].includes(v.status);
  const file = (name: string) =>
    "/api/measurement/mine/" +
    encodeURIComponent(c.id) +
    "/file/" +
    encodeURIComponent(name);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMsg("");
    try {
      setV(
        await api<Visit>(
          "/api/measurement/mine/" + encodeURIComponent(c.id) + "/" + v.id,
          body,
        ),
      );
      setMsg(body.action === "done" ? "Marked done." : "Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "It did not save.");
    }
    setBusy(false);
  }
  async function photo(fileIn: File, itemId?: string) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(
        "/api/measurement/mine/" +
          encodeURIComponent(c.id) +
          "/" +
          v.id +
          "/photo/" +
          encodeURIComponent(fileIn.name || "photo.jpg"),
        { method: "PUT", body: fileIn },
      );
      const out = await r.json();
      if (!r.ok) throw new Error(out.detail || "The photo did not upload.");
      if (itemId) {
        const cur = v.checklist?.[itemId] || { state: "", note: "", photo: "" };
        await act({
          action: "save",
          checklist: { [itemId]: { ...cur, photo: out.name } },
        });
      } else {
        setV((x) => ({
          ...x,
          photos: [
            ...(x.photos || []),
            { name: out.name, at: new Date().toISOString() },
          ],
        }));
        setMsg("Photo added.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "The photo did not upload.");
    }
    setBusy(false);
  }
  const answer = (id: string, state: string) => {
    const cur = v.checklist?.[id] || { state: "", note: "", photo: "" };
    void act({ action: "save", checklist: { [id]: { ...cur, state } } });
  };
  return (
    <div className="mine-visit">
      <button className="btn small" onClick={onBack}>
        ‹ All my visits
      </button>
      <h1>
        {c.name} <TypeChip type={v.type} />
      </h1>
      <p className="sub">
        {[
          v.date || "No date yet",
          c.pid,
          v.revisit ? "Revisit: " + v.reason : "",
        ]
          .filter(Boolean)
          .join(" · ")}{" "}
        <StatusPill v={v} />
        {late(v) && " Late"}
      </p>
      <section className="card mine-site">
        <h2>Site</h2>
        <p>{c.siteAddress || "Address not given"}</p>
        <p className="sub">{[c.city, c.pin].filter(Boolean).join(" · ")}</p>
        <div className="flexrow">
          {c.site.location && (
            <a
              className="btn"
              href={c.site.location}
              target="_blank"
              rel="noopener"
            >
              Open Google location
            </a>
          )}
          {c.drawing && (
            <a
              className="btn"
              href={file(c.drawing)}
              target="_blank"
              rel="noopener"
            >
              Open drawing
            </a>
          )}
          {c.site.supervisorPhone && (
            <a className="btn" href={"tel:" + c.site.supervisorPhone}>
              Call {c.site.supervisor || "site supervisor"}
            </a>
          )}
          {c.site.clientPhone && (
            <a className="btn" href={"tel:" + c.site.clientPhone}>
              Call client
            </a>
          )}
        </div>
        {c.siteContact && <p className="sub">Site contact: {c.siteContact}</p>}
        {c.designer && <p className="sub">Designer: {c.designer}</p>}
        {v.note && <p>Note: {v.note}</p>}
      </section>
      {!lead && (
        <p className="sub">
          You go along with {v.assigneeName}. Only they can update this visit.
        </p>
      )}
      {lead && v.status === "assigned" && (
        <section className="card">
          <h2>Will you take this {typeName(v.type).toLowerCase()} visit?</h2>
          <div className="flexrow">
            <button
              className="btn dark"
              disabled={busy}
              onClick={() => void act({ action: "accept" })}
            >
              Accept
            </button>
            <input
              aria-label="Reason"
              placeholder="Reason, if you decline"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              className="btn"
              disabled={busy || !reason.trim()}
              onClick={() => void act({ action: "decline", reason })}
            >
              Decline
            </button>
          </div>
        </section>
      )}
      {lead && !closed && v.status !== "assigned" && (
        <>
          {!!list.length && (
            <section className="card">
              <h2>{typeName(v.type)} checklist</h2>
              {list.map((it) => {
                const r = v.checklist?.[it.id];
                return (
                  <div key={it.id} className="mine-check">
                    <p>{it.text}</p>
                    <div className="flexrow">
                      {(
                        [
                          ["ok", "OK"],
                          ["wrong", "Wrong"],
                          ["notReady", "Site not ready"],
                        ] as const
                      ).map(([s, label]) => (
                        <button
                          key={s}
                          className={
                            "btn small" + (r?.state === s ? " dark" : "")
                          }
                          disabled={busy}
                          onClick={() => answer(it.id, s)}
                        >
                          {label}
                        </button>
                      ))}
                      <label className="btn small">
                        {r?.photo
                          ? "Photo added ✓"
                          : it.photo
                            ? "Add photo (needed)"
                            : "Add photo"}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void photo(f, it.id);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
          {v.type === "pdi" && !!data.pdiFields.length && (
            <section className="card">
              <h2>PDI details</h2>
              {data.pdiFields.map((f) => (
                <label key={f.id} className="m-wide">
                  {f.text}
                  <input
                    defaultValue={v.fields?.[f.id] || ""}
                    onBlur={(e) => {
                      if (e.target.value !== (v.fields?.[f.id] || ""))
                        void act({
                          action: "save",
                          fields: { ...v.fields, [f.id]: e.target.value },
                        });
                    }}
                  />
                </label>
              ))}
            </section>
          )}
          <section className="card">
            <h2>Snag list (what is wrong at site)</h2>
            <ul>
              {v.snags.map((s, i) => (
                <li key={i}>
                  {s.text}{" "}
                  <button
                    className="btn small"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "save",
                        snags: v.snags.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flexrow">
              <input
                aria-label="New snag"
                placeholder="For example: island point 20 cm off"
                value={snag}
                onChange={(e) => setSnag(e.target.value)}
              />
              <button
                className="btn"
                disabled={busy || !snag.trim()}
                onClick={() => {
                  void act({
                    action: "save",
                    snags: [...v.snags, { text: snag.trim(), fixed: false }],
                  });
                  setSnag("");
                }}
              >
                Add
              </button>
            </div>
          </section>
          <section className="card">
            <h2>Photos and note</h2>
            <label className="btn">
              Add site photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void photo(f);
                }}
              />
            </label>
            <p className="sub">{(v.photos || []).length} photo(s) added</p>
            <label className="m-wide">
              Note for the team
              <textarea
                defaultValue={v.visitNote || ""}
                onBlur={(e) => {
                  if (e.target.value !== (v.visitNote || ""))
                    void act({ action: "save", note: e.target.value });
                }}
              />
            </label>
          </section>
          <button
            className="btn dark mine-done"
            disabled={busy || list.some((it) => !v.checklist?.[it.id]?.state)}
            onClick={() => {
              if (confirm("Mark this visit done?"))
                void act({ action: "done" });
            }}
          >
            {list.some((it) => !v.checklist?.[it.id]?.state)
              ? "Answer every checklist point first"
              : "Mark visit done"}
          </button>
        </>
      )}
      {lead && v.status === "done" && (
        <button
          className="btn"
          disabled={busy}
          onClick={() => void act({ action: "reopen" })}
        >
          Reopen (made a mistake)
        </button>
      )}
      {msg && (
        <p className="sub" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
