// Reports page: loaded only when opened, so its code is not in the main Measurement bundle.
import { useState } from "react";
import { STAGES, count, downloadCsv, slug, type Request } from "./model";
import { Card } from "./components";
function Bars({
  title,
  values,
}: {
  title: string;
  values: [string, number][];
}) {
  const max = Math.max(1, ...values.map((v) => v[1]));
  return (
    <Card title={title}>
      {values.length ? (
        values.map(([label, n]) => (
          <div className="react-bar" key={label}>
            <div>
              {label}
              <b>{n}</b>
            </div>
            <meter aria-label={label} min={0} max={max} value={n} />
          </div>
        ))
      ) : (
        <p>No requests yet.</p>
      )}
    </Card>
  );
}
export function Reports({
  records,
  summary,
  onStage,
}: {
  records: Request[];
  summary: string;
  onStage: (s: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const stages = STAGES.map((stage) => ({
    stage,
    counts: count(records.filter((r) => r.stage === stage)),
  }));
  const headers = [
    "Visit type",
    "Open",
    "Scheduled",
    "To schedule",
    "Late",
    "Done",
  ];
  const rows = stages.map((s) => [s.stage, ...Object.values(s.counts)]);
  const pdf = () => {
    try {
      if (!window.jspdf) throw new Error();
      window.Kit.pdf(
        "measurement-report.pdf",
        "MAGPPIE Measurement Summary",
        summary + " | Generated " + new Date().toLocaleString(),
        stages.map((s) => ({
          heading: s.stage,
          rows: Object.entries(s.counts),
        })),
      );
      setFeedback("PDF prepared. Check browser downloads.");
    } catch {
      setFeedback("PDF could not be created. Try CSV instead.");
    }
  };
  const by = (key: string): [string, number][] =>
    window.Measurements.group(records, key).map((g) => [
      g.name,
      g.items.length,
    ]);
  const n = count(records);
  return (
    <>
      <div className="m-toolbar">
        <strong>Summary</strong>
        <button
          className="btn"
          onClick={() => {
            downloadCsv(
              [
                ["MAGPPIE Measurement", summary],
                ["Generated", new Date().toISOString()],
                headers,
                ...rows,
              ],
              "measurement-summary.csv",
            );
            setFeedback("CSV prepared. Check browser downloads.");
          }}
        >
          Export CSV
        </button>
        <button className="btn" onClick={pdf}>
          Export PDF
        </button>
        <span role="status">{feedback}</span>
      </div>
      <div className="m-table-wrap react-summary">
        <table className="m-table">
          <caption>Stage summary</caption>
          <thead>
            <tr>
              {[...headers, "Requests"].map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={stages[i].stage}>
                {row.map((v, j) => (
                  <td key={j} data-label={headers[j]}>
                    {v}
                  </td>
                ))}
                <td data-label="Requests">
                  <button
                    className="btn small"
                    aria-label={"View " + stages[i].stage + " requests"}
                    onClick={() => onStage(slug(stages[i].stage))}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cols react-reports">
        <Bars
          title="By visit type"
          values={stages.map((s) => [s.stage, s.counts.Open + s.counts.Done])}
        />
        <Bars
          title="By status"
          values={[
            ["Scheduled", n.Scheduled],
            ["To schedule", n["To Schedule"]],
            ["Done", n.Done],
          ]}
        />
        <Bars title="Work by assigned person" values={by("assignee")} />
        <Bars title="By city" values={by("city")} />
        <Bars title="By zone" values={by("zone")} />
        <Card title="Data quality">
          <p>
            {records.filter((r) => !r.date && r.status !== "Done").length} open
            requests without a visit date
          </p>
          <p>{records.filter((r) => !r.assignee).length} not assigned</p>
          <p>
            {records.filter((r) => !r.coordinates).length} without exact
            coordinates
          </p>
          <p className="sub">
            Time-target performance is unavailable until approved targets and
            assignment timestamps are defined.
          </p>
        </Card>
      </div>
    </>
  );
}
