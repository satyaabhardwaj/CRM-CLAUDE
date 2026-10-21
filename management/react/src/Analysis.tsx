import type { Client, Range } from "./types";
import { analysis, avg, one, K, type Bar } from "./model";
import { Card, Select } from "./ui";
export const ranges: readonly (readonly [Range, string])[] = [
  ["all", "All time"],
  ["month", "This month"],
  ["lastMonth", "Last month"],
  ["week", "This week"],
];
export function Bars({
  rows,
  label,
  empty = "No data yet.",
}: {
  rows: Bar[];
  label: string;
  empty?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return rows.length ? (
    <div className="ana-bars" role="table" aria-label={label}>
      {rows.map((r, i) => (
        <div
          className="ana-row"
          role="row"
          key={r.label + "-" + i}
          title={r.tip || r.label + ": " + r.text}
        >
          <span className="ana-name" role="cell">
            {r.label}
          </span>
          <span className="ana-track" role="presentation">
            <i
              className={r.bad ? "bad" : ""}
              style={{
                width:
                  Math.max(r.value ? 3 : 0, Math.round((r.value / max) * 100)) +
                  "%",
              }}
            />
          </span>
          <span className="ana-val num" role="cell">
            {r.text}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <div className="hint">{empty}</div>
  );
}
function Stat({
  label,
  value,
  note = "",
  bad = false,
}: {
  label: string;
  value: string;
  note?: string;
  bad?: boolean;
}) {
  return (
    <div className="ana-stat">
      <span>{label}</span>
      <b className={"num" + (bad ? " bad" : "")}>{value}</b>
      <small>{note}</small>
    </div>
  );
}
export function Analysis({
  all,
  range,
  setRange,
}: {
  all: Client[];
  range: Range;
  setRange: (v: Range) => void;
}) {
  const a = analysis(all, range);
  return (
    <div className="mg">
      <div className="mg-wait">
        <span className="sub">
          {a.all.length} clients counted · by the day the lead was received
        </span>
        <div className="management-filters">
          <Select
            label="Dates"
            value={range}
            options={ranges}
            onChange={(v) => setRange(v as Range)}
          />
        </div>
      </div>
      <div className="ana-grid">
        <Card
          title="Where clients are now"
          note={a.reached + " of " + a.all.length + " reached approval"}
        >
          <Bars label="Clients by stage" rows={a.stages} />
        </Card>
        <Card title="Speed" note="Averages">
          <div className="ana-stats">
            <Stat
              label="24-hour rule kept"
              value={a.keptPct == null ? "No data yet" : a.keptPct + "%"}
              note={
                a.judged.length
                  ? a.kept + " of " + a.judged.length + " leads"
                  : ""
              }
              bad={a.keptPct != null && a.keptPct < 80}
            />
            <Stat
              label="First conversation"
              value={
                a.firstTalk.length
                  ? one(avg(a.firstTalk)) + " h"
                  : "No data yet"
              }
              note="after the lead arrives"
            />
            <Stat
              label="Designer turnaround"
              value={
                a.toProposal.length
                  ? one(avg(a.toProposal)) + " days"
                  : "No data yet"
              }
              note="DRF sent to first proposal"
            />
            <Stat
              label="Client decision"
              value={
                a.toYes.length ? one(avg(a.toYes)) + " days" : "No data yet"
              }
              note="first proposal to approval"
            />
            <Stat
              label="Token after approval"
              value={
                a.toToken.length ? one(avg(a.toToken)) + " days" : "No data yet"
              }
              note="approval to token confirmed"
            />
            <Stat
              label="Revisions per approval"
              value={one(a.revisionsPerApproval)}
              note={a.totalRev + " revisions in all"}
            />
          </div>
        </Card>
        <Card title="Money" note="Booking share">
          <div className="ana-stats">
            <Stat
              label="Due"
              value={K().short(a.due)}
              note={a.cash.length + " client(s)"}
            />
            <Stat
              label="Collected"
              value={K().short(a.got)}
              note={a.due ? Math.round((a.got / a.due) * 100) + "% of due" : ""}
            />
            <Stat
              label="Still to collect"
              value={K().short(a.left)}
              note={
                a.due ? Math.round((a.left / a.due) * 100) + "% of due" : ""
              }
              bad={a.left > 0}
            />
          </div>
          <b className="ana-sub">
            Tokens not yet in, by how long since approval
          </b>
          <Bars
            label="Token ageing"
            rows={a.age}
            empty="No tokens are waiting."
          />
        </Card>
        <Card title="By sales person" note="Open order value">
          <Bars label="Sales person report" rows={a.people} />
        </Card>
        <Card title="By lead source" note="Leads and approvals">
          <Bars label="Lead source report" rows={a.sources} />
        </Card>
        <Card title="By PSM" note="Leads sent and approvals">
          <Bars
            label="PSM report"
            rows={a.psms}
            empty="No PSM leads in this period."
          />
        </Card>
        <Card title="By designer" note="Proposals made">
          <Bars
            label="Designer report"
            rows={a.designers}
            empty="No designer has been allotted yet."
          />
        </Card>
        <Card title="Why designs get revised" note={a.totalRev + " revisions"}>
          <Bars
            label="Revision reasons"
            rows={a.reasons}
            empty="No revisions in this period."
          />
        </Card>
      </div>
    </div>
  );
}
