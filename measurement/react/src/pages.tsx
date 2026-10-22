import { useState } from "react";
import { STAGES, count, downloadCsv, slug, type Request } from "./model";
import { Card, Pill, RequestRows } from "./components";
export function Overview({
  records,
  onOpen,
  onStage,
  onStatus,
}: {
  records: Request[];
  onOpen: (r: Request) => void;
  onStage: (stage: string) => void;
  onStatus: (s: string) => void;
}) {
  const n = count(records);
  return (
    <>
      {(n.Late > 0 || n["To Schedule"] > 0) && (
        <div className="m-toolbar">
          <button className="btn" onClick={() => onStatus("Late")}>
            {n.Late} late
          </button>
          <button className="btn" onClick={() => onStatus("To Schedule")}>
            {n["To Schedule"]} to schedule
          </button>
        </div>
      )}
      <div className="twolists measurement-home">
        <Card title="Measurement stages" tag="4">
          {STAGES.map((stage) => {
            const n = count(records.filter((r) => r.stage === stage));
            return (
              <button
                className="row react-row"
                key={stage}
                onClick={() => onStage(slug(stage))}
              >
                <span>
                  <strong>{stage}</strong>
                  <span className="sub">
                    {n.Open} open · {n.Scheduled} scheduled · {n["To Schedule"]}{" "}
                    to schedule · {n.Done} done
                  </span>
                </span>
                <span className="pill grey">{n.Open} open</span>
              </button>
            );
          })}
        </Card>
        <Card
          title="Upcoming visits"
          tag={records.filter((r) => r.status === "Scheduled").length}
        >
          <RequestRows
            records={window.Measurements.sort(
              records.filter((r) => r.status === "Scheduled"),
              "visit",
            )}
            onOpen={onOpen}
            empty="No visits are booked."
          />
        </Card>
        <Card title="Recently changed" tag={Math.min(records.length, 12)}>
          <RequestRows
            records={window.Measurements.sort(records, "recent").slice(0, 12)}
            onOpen={onOpen}
          />
        </Card>
      </div>
    </>
  );
}
export function Requests({
  records,
  onOpen,
}: {
  records: Request[];
  onOpen: (r: Request) => void;
}) {
  const [sort, setSort] = useState("recent"),
    [expanded, setExpanded] = useState(false),
    [feedback, setFeedback] = useState("");
  const ordered = window.Measurements.sort(records, sort),
    visible = expanded ? ordered : ordered.slice(0, 10);
  const headers = [
    "Client",
    "Visit type",
    "Location",
    "Assigned to",
    "Visit date",
    "Status",
    "Details",
  ];
  return (
    <>
      <div className="m-toolbar">
        <label>
          Sort{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Recent</option>
            <option value="client">Client</option>
            <option value="visit">Visit date</option>
          </select>
        </label>
        <button
          className="btn"
          onClick={() => {
            downloadCsv(
              [
                [
                  "Client",
                  "Project",
                  "Visit type",
                  "Status",
                  "Visit date",
                  "City",
                  "State",
                  "Zone",
                  "Salesperson",
                  "Assigned to",
                ],
                ...ordered.map((r) => [
                  r.client,
                  r.order,
                  r.stage,
                  r.late ? "Late" : r.status,
                  r.date,
                  r.city,
                  r.state,
                  r.zone,
                  r.owner,
                  r.assignee,
                ]),
              ],
              "measurement-requests.csv",
            );
            setFeedback("CSV prepared. Check browser downloads.");
          }}
        >
          Export CSV
        </button>
        <span className="sub">
          {visible.length} of {records.length}
        </span>
        <span role="status">{feedback}</span>
      </div>
      <div className="m-table-wrap">
        <table className="m-table">
          <caption>Measurement requests</caption>
          <thead>
            <tr>
              {headers.map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td data-label="Client">
                  <div>
                    <strong>{r.client}</strong>
                    <div className="sub">{r.order}</div>
                  </div>
                </td>
                <td data-label="Visit type">{r.stage}</td>
                <td data-label="Location">
                  {[r.city, r.state].filter(Boolean).join(", ") ||
                    "Not provided"}
                </td>
                <td data-label="Assigned to">{r.assignee || "Not assigned"}</td>
                <td data-label="Visit date">{r.date || "Not set"}</td>
                <td data-label="Status">
                  <Pill record={r} />
                </td>
                <td data-label="Details">
                  <button
                    className="btn small"
                    aria-label={`View ${r.client} ${r.stage}`}
                    onClick={() => onOpen(r)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!records.length && (
          <p className="react-empty">
            No requests match. Clear filters to see more requests.
          </p>
        )}
      </div>
      {records.length > 10 && (
        <button className="btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : "Show all"}
        </button>
      )}
    </>
  );
}
