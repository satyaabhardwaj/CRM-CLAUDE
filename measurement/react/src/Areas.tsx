import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { createPortal } from "react-dom";
import { Card, RequestRows } from "./components";
import { count, type Request } from "./model";
export default function Areas({
  records,
  onOpen,
  focusId,
}: {
  records: Request[];
  onOpen: (r: Request) => void;
  focusId: string;
}) {
  const [popups, setPopups] = useState<
    { container: HTMLElement; items: Request[] }[]
  >([]);
  const [group, setGroup] = useState<keyof Request>("city"),
    [area, setArea] = useState(""),
    [error, setError] = useState("");
  const canvas = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    open = useRef(onOpen);
  open.current = onOpen;
  const selected = area
    ? records.filter((r) => (r[group] || "Not provided") === area)
    : records;
  const located = useMemo(
    () =>
      records.filter(
        (r) =>
          (!area || (r[group] || "Not provided") === area) && r.coordinates,
      ),
    [records, group, area],
  );
  useEffect(() => {
    if (!canvas.current) return;
    const current = L.map(canvas.current).setView([22.5, 79], 4);
    map.current = current;
    current.attributionControl.addAttribution("Natural Earth · public domain");
    const layer = L.layerGroup().addTo(current),
      abort = new AbortController();
    setError("");
    const draw = () => {
      layer.clearLayers();
      const next: { container: HTMLElement; items: Request[] }[] = [];
      window.Measurements.clusters(located, current.getZoom()).forEach(
        (cluster) => {
          const content = document.createElement("div");
          next.push({ container: content, items: cluster.items });
          L.marker([cluster.position.lat, cluster.position.lng], {
            icon: L.divIcon({
              className: "m-pin",
              html: String(cluster.items.length),
              iconSize: [30, 30],
            }),
            title: cluster.items.length + " measurement requests",
          })
            .addTo(layer)
            .bindPopup(content);
        },
      );
      setPopups(next);
    };
    current.on("zoomend", draw);
    draw();
    const focused = located.find((r) => r.id === focusId);
    if (focused?.coordinates) current.setView(focused.coordinates, 12);
    else if (located.length)
      current.fitBounds(
        located.map((r) => r.coordinates!),
        { padding: [30, 30], maxZoom: 12 },
      );
    fetch("/measurement/vendor/world-outline.geojson", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        L.geoJSON(data, {
          style: {
            color: "#9cabb1",
            weight: 1,
            fillColor: "#f8faf9",
            fillOpacity: 1,
          },
          interactive: false,
        })
          .addTo(current)
          .bringToBack();
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError("Map outline unavailable; coordinates remain accessible.");
      });
    const resize = new ResizeObserver(() => current.invalidateSize());
    resize.observe(canvas.current);
    return () => {
      abort.abort();
      resize.disconnect();
      current.remove();
      map.current = null;
    };
  }, [located, focusId]);
  return (
    <>
      {popups.map(({ container, items }, i) =>
        createPortal(
          <>
            {items.map((r) => (
              <div key={r.id}>
                <b>{r.client}</b>
                <p>{r.stage}</p>
                <button className="btn small" onClick={() => open.current(r)}>
                  View request
                </button>
              </div>
            ))}
          </>,
          container,
          String(i),
        ),
      )}
      <div className="twolists">
        <Card
          title="Areas"
          tag={
            <select
              aria-label="Group areas"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value as keyof Request);
                setArea("");
              }}
            >
              {[
                ["city", "By city"],
                ["state", "By state"],
                ["zone", "By zone"],
                ["owner", "By sales person"],
                ["assignee", "By assigned person"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          }
        >
          {window.Measurements.group(records, group).map((g) => {
            const n = count(g.items);
            return (
              <button
                className="row react-row"
                key={g.name}
                onClick={() => setArea(g.name)}
                aria-pressed={area === g.name}
              >
                <span>
                  <strong>{g.name}</strong>
                  <span className="sub">
                    {n.Open} open · {n.Scheduled} scheduled · {n.Done} done
                  </span>
                </span>
                <span className="pill grey">{g.items.length} requests</span>
              </button>
            );
          })}
          {!records.length && <p>No requests yet.</p>}
        </Card>
        <Card title="Site map" tag={located.length + " located"}>
          <div className="flexrow">
            <button
              className="btn small"
              disabled={!located.length}
              onClick={() =>
                map.current?.fitBounds(
                  located.map((r) => r.coordinates!),
                  { padding: [30, 30], maxZoom: 14 },
                )
              }
            >
              Fit sites
            </button>
            {area && (
              <button className="btn small" onClick={() => setArea("")}>
                Clear area
              </button>
            )}
          </div>
          <div
            ref={canvas}
            className="m-map"
            role="region"
            aria-label="Measurement site map"
          />
          <p className="sub">
            {located.length} requests with exact coordinates ·{" "}
            {selected.length - located.length} missing coordinates
          </p>
          {error && <p role="status">{error}</p>}
          <p className="sub">
            Offline geographic overview. Only recorded exact coordinates are
            shown; city centres are never used as site locations.
          </p>
        </Card>
      </div>
      <Card title={area || "Site requests"}>
        <RequestRows
          records={selected}
          onOpen={onOpen}
          empty="No matching requests."
        />
      </Card>
    </>
  );
}
