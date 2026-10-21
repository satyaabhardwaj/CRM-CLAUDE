import { useState } from "react";
import { STAGES, type Filters, type Request } from "./model";
import { Dialog } from "./components";
export function FilterDialog({
  records,
  value,
  onApply,
  onClose,
}: {
  records: Request[];
  value: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...value, stages: [...value.stages] }),
    [error, setError] = useState("");
  const set = (key: keyof Filters, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const fields: [keyof Filters, keyof Request, string][] = [
    ["city", "city", "City"],
    ["region", "state", "State"],
    ["owner", "owner", "Salesperson"],
    ["product", "product", "Product"],
    ["zone", "zone", "Zone"],
  ];
  return (
    <Dialog title="Filter requests" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.stages.length) {
            setError("Select at least one visit type.");
            return;
          }
          onApply(draft);
        }}
      >
        <fieldset>
          <legend>Visit type</legend>
          {STAGES.map((stage) => (
            <label className="m-check" key={stage}>
              <input
                type="checkbox"
                checked={draft.stages.includes(stage)}
                onChange={(e) => {
                  setError("");
                  setDraft((d) => ({
                    ...d,
                    stages: e.target.checked
                      ? [...d.stages, stage]
                      : d.stages.filter((s) => s !== stage),
                  }));
                }}
              />
              {stage}
            </label>
          ))}
        </fieldset>
        <div className="m-fields">
          {fields.map(([key, source, label]) => (
            <label key={key}>
              {label}
              <select
                value={String(draft[key])}
                onChange={(e) => set(key, e.target.value)}
              >
                <option value="">All</option>
                {[
                  ...new Set(
                    records.map((r) => String(r[source] || "")).filter(Boolean),
                  ),
                ]
                  .sort()
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </label>
          ))}
          <label>
            Last order change
            <select
              value={draft.dateRange}
              onChange={(e) => set("dateRange", e.target.value)}
            >
              {[
                "All time",
                "Today",
                "Last 7 days",
                "Last 30 days",
                "This month",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={draft.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {[
                "All statuses",
                "Open",
                "Scheduled",
                "To Schedule",
                "Late",
                "Done",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        {error && (
          <p className="m-error" role="alert">
            {error}
          </p>
        )}
        <div className="m-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn dark" type="submit">
            Apply filters
          </button>
        </div>
      </form>
    </Dialog>
  );
}
