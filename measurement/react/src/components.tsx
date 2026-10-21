import { useEffect, useRef, type ReactNode } from "react";
import { count, timestamp, type Request } from "./model";
export function Card({
  title,
  tag,
  children,
  className = "",
}: {
  title: string;
  tag?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"card " + className}>
      <div className="card-h">
        <h2>{title}</h2>
        {tag}
      </div>
      <div className="card-b">{children}</div>
    </section>
  );
}
export function Pill({ record }: { record: Request }) {
  return (
    <span
      className={
        "pill " +
        (record.late
          ? "red"
          : record.status === "Done"
            ? "green"
            : record.status === "Scheduled"
              ? "blue"
              : "grey")
      }
    >
      {record.late ? "Late" : record.status}
    </span>
  );
}
export function RequestRows({
  records,
  onOpen,
  empty = "No requests yet.",
}: {
  records: Request[];
  onOpen: (r: Request) => void;
  empty?: string;
}) {
  return (
    <div className="rows">
      {records.length ? (
        records.map((r) => (
          <button
            key={r.id}
            className="row react-row"
            onClick={() => onOpen(r)}
          >
            <span>
              <strong>{r.client}</strong>
              <span className="sub">
                {[
                  r.stage,
                  r.city,
                  r.assignee || "Not assigned",
                  r.date || "No visit date",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <Pill record={r} />
          </button>
        ))
      ) : (
        <p className="react-empty">{empty}</p>
      )}
    </div>
  );
}
export function Stats({
  records,
  onStatus,
}: {
  records: Request[];
  onStatus: (status: string) => void;
}) {
  return (
    <div className="statrow">
      {Object.entries(count(records)).map(([name, value]) => (
        <button className="stat" key={name} onClick={() => onStatus(name)}>
          <span>{name}</span>
          <b>{value}</b>
        </button>
      ))}
    </div>
  );
}
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"m-dialog " + (wide ? "react-detail" : "")}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="react-dialog-heading">
        <h2>{title}</h2>
        <button className="btn" onClick={onClose} aria-label="Close dialog">
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Details({
  record: r,
  onClose,
  onMap,
}: {
  record: Request;
  onClose: () => void;
  onMap: (r: Request) => void;
}) {
  const facts = (pairs: [string, string][]) => (
    <dl className="react-facts">
      {pairs.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "Not provided"}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <Dialog title={r.client} onClose={onClose} wide>
      <p className="sub">
        {r.order} · {r.stage} · Zoho Orders
      </p>
      <Pill record={r} />
      <div className="cols">
        <Card title="Visit">
          {facts([
            ["Visit type", r.stage],
            ["Status", r.status],
            ["Visit date", r.date],
            ["Expected visit", r.expected_date],
            ["Measurement person", r.assigned_person],
            ["Requested", timestamp(r.requested_at)],
            ["Completed", timestamp(r.completed_date)],
          ])}
          {r.schedule_note && <p>{r.schedule_note}</p>}
        </Card>
        <Card title="Site">
          {facts([
            ["City", r.city],
            ["State", r.state],
            ["Zone", r.zone],
            ["Address", r.address],
            ["Product", r.product],
          ])}
          {r.coordinates ? (
            <button className="btn" onClick={() => onMap(r)}>
              Show on map
            </button>
          ) : (
            <p className="sub">
              Exact site coordinates are not recorded in Zoho.
            </p>
          )}
        </Card>
        <Card title="Source">
          {facts([
            ["CRM order ID", r.record_id],
            ["CRM workflow", r.crm_stage],
            ["Owner", r.owner],
            ["Request bucket", r.request_bucket],
            ["Last order change", timestamp(r.modified_at)],
          ])}
        </Card>
      </div>
      <p className="m-note">
        These are live, read-only Zoho records. Scheduling and status changes
        must be made in Zoho; refresh here to see the latest data.
      </p>
    </Dialog>
  );
}
