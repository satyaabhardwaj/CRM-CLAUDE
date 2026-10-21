export const STAGES = [
  "First Measurement",
  "EPT Marking",
  "EPT Verification",
  "PDI",
] as const;
export type Stage = (typeof STAGES)[number];
export type Page = "overview" | "requests" | "areas" | "reports";
export interface Request {
  id: string;
  client: string;
  order: string;
  stage: Stage;
  status: string;
  record_id: string;
  city: string;
  state: string;
  zone: string;
  owner: string;
  assignee: string;
  assigned_person: string;
  product: string;
  address: string;
  date: string;
  expected_date: string;
  requested_at: string;
  completed_date: string;
  modified_at: string;
  received_at: string;
  crm_stage: string;
  request_bucket: string;
  schedule_note: string;
  coordinates: [number, number] | null;
  late: boolean;
}
export interface Filters {
  stages: string[];
  search: string;
  status: string;
  city: string;
  region: string;
  owner: string;
  product: string;
  zone: string;
  zones: string[];
  dateRange: string;
}
interface Selectors {
  defaults(): Filters;
  filter(
    records: Request[],
    filters: Filters,
    options?: { ignoreStatus?: boolean; now?: Date },
  ): Request[];
  sort(records: Request[], order: string): Request[];
  group(records: Request[], key: string): { name: string; items: Request[] }[];
  clusters(
    records: Request[],
    zoom: number,
  ): { position: { lat: number; lng: number }; items: Request[] }[];
}
declare global {
  interface Window {
    Measurements: Selectors;
    Kit: {
      pdf(
        file: string,
        title: string,
        sub: string,
        sections: { heading: string; rows: (string | number)[][] }[],
      ): void;
    };
    jspdf?: unknown;
  }
}
export const slug = (stage: string) => stage.toLowerCase().replaceAll(" ", "-");
export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
export function validDate(value: string) {
  const date = new Date(value + "T00:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(+date) &&
    date.toISOString().slice(0, 10) === value
  );
}
export function adapt(raw: unknown, now = new Date()): Request {
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid Measurement record");
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== "string" || !STAGES.includes(input.stage as Stage))
    throw new Error("Invalid Measurement record");
  const record: Record<string, unknown> = {};
  for (const key of [
    "id",
    "client",
    "order",
    "stage",
    "status",
    "record_id",
    "city",
    "state",
    "zone",
    "owner",
    "assigned_person",
    "product",
    "address",
    "date",
    "expected_date",
    "requested_at",
    "completed_date",
    "modified_at",
    "received_at",
    "crm_stage",
    "request_bucket",
    "schedule_note",
  ])
    record[key] = typeof input[key] === "string" ? input[key] : "";
  record.status = record.status === "Completed" ? "Done" : record.status;
  record.city = record.city === "City not added" ? "" : record.city;
  record.assignee = record.assigned_person;
  const coords = input.coordinates;
  record.coordinates =
    Array.isArray(coords) &&
    coords.length === 2 &&
    coords.every((v) => typeof v === "number" && Number.isFinite(v)) &&
    Math.abs(coords[0]) <= 90 &&
    Math.abs(coords[1]) <= 180 &&
    (coords[0] !== 0 || coords[1] !== 0)
      ? coords
      : null;
  const date = record.date as string;
  record.late =
    record.status !== "Done" && validDate(date) && date < today(now);
  return record as unknown as Request;
}
export function count(records: Request[]) {
  return {
    Open: records.filter((r) => r.status !== "Done").length,
    Scheduled: records.filter((r) => r.status === "Scheduled").length,
    "To Schedule": records.filter((r) => r.status === "To Schedule").length,
    Late: records.filter((r) => r.late).length,
    Done: records.filter((r) => r.status === "Done").length,
  };
}
export function select(
  records: Request[],
  filters: Filters,
  tab: string,
  model: Selectors = window.Measurements,
) {
  const stage = STAGES.find((s) => slug(s) === tab);
  const selected = model.filter(
    records,
    { ...filters, stages: stage ? [stage] : filters.stages },
    { ignoreStatus: true },
  );
  return selected.filter(
    (r) =>
      filters.status === "All statuses" ||
      (filters.status === "Open"
        ? r.status !== "Done"
        : filters.status === "Late"
          ? r.late
          : r.status === filters.status),
  );
}
export function csvText(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v ?? "")
                .replace(/^[=+@\-\t\r]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n")
  );
}
export function downloadCsv(rows: (string | number)[][], filename: string) {
  const url = URL.createObjectURL(
    new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function route(hash = location.hash): { tab: string; page: Page } {
  const [tab, page] = hash.replace(/^#/, "").split("/");
  return {
    tab: ["all", ...STAGES.map(slug)].includes(tab) ? tab : "all",
    page: ["requests", "areas", "reports"].includes(page)
      ? (page as Page)
      : "overview",
  };
}
export const timestamp = (value: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Not provided";
