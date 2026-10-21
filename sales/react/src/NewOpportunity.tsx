import { useState } from "react";
import type { Client, Context } from "./types";
import { assignArchitect, type SalesClient } from "./model";
import { ArchitectPicker } from "./ArchitectPicker";
import { upload } from "./data";
export const initialDraft = {
  name: "",
  phone: "",
  city: "",
  product: "Kitchen",
  source: "",
  budget: "",
  siteType: "",
  segment: "",
  priority: "",
  note: "",
  architect: false,
  architectId: "",
};
export type OpportunityDraft = typeof initialDraft;
export function opportunity(d: OpportunityDraft, clients: Client[]): Client {
  if (!d.name.trim() || !d.phone.trim() || !d.source)
    throw Error("Name, phone and source are needed.");
  const next = (key: "pid" | "cid", prefix: string, start: number) =>
    prefix +
    (clients.reduce(
      (n, c) =>
        Math.max(n, Number(String(c[key] || "").replace(prefix, "")) || 0),
      start,
    ) +
      1);
  return window.SalesLogic.ensure({
    id: "c" + crypto.randomUUID(),
    name: d.name.trim(),
    phone: d.phone.trim(),
    city: d.city.trim() || "City not set",
    product: d.product,
    source: d.source,
    budget: d.budget,
    siteType: d.siteType,
    segment: d.segment,
    priority: d.priority,
    note: d.note,
    pid: next("pid", "P-", 1000),
    cid: next("cid", "C-", 2200),
    owner: window.People.list[0].id,
    sm: window.People.list[0].name,
    stage: "qualified",
    receivedAt: new Date().toISOString(),
    ownLead: true,
  });
}
export function NewOpportunity({
  ctx,
  disabled,
}: {
  ctx: Context;
  disabled: boolean;
}) {
  const [d, set] = useState({ ...initialDraft });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const update = (key: keyof OpportunityDraft, value: string | boolean) => {
    set((x) => ({ ...x, [key]: value }));
    setError("");
  };
  const text = (
    key: Exclude<keyof OpportunityDraft, "architect">,
    label: string,
    type = "text",
  ) => (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        type={type}
        value={d[key]}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  const select = (
    key: Exclude<keyof OpportunityDraft, "architect">,
    label: string,
    options: string[],
    required = false,
  ) => (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={d[key]}
        onChange={(e) => update(key, e.target.value)}
      >
        {!required && <option value="">Choose</option>}
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  async function submit() {
    try {
      const c = opportunity(d, ctx.everyone);
      if (d.architect) assignArchitect(c as SalesClient, d.architectId);
      if (file) {
        setUploading(true);
        const name = await upload(c.id, file);
        c.docs = { layout: name };
      }
      ctx.update(() => ctx.add(c));
      ctx.open(c);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Opportunity could not be saved.",
      );
    } finally {
      setUploading(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled && !uploading) void submit();
      }}
      className="sales-opportunity"
    >
      <div className="sheet-h">
        <h2>New opportunity</h2>
      </div>
      <fieldset
        className="sales-form card card-b"
        disabled={disabled || uploading}
      >
        <div className="g4">
          {text("name", "Customer name")}
          {text("phone", "Phone", "tel")}
          {text("city", "City")}
          {select("source", "Source", [
            "Social media",
            "Walk-in",
            "Architect reference",
            "Referral",
          ])}
          {select(
            "product",
            "Product",
            [
              "Kitchen",
              "Wardrobe",
              "Kitchen + wardrobes",
              "Backsplash",
              "Countertop",
              "Sunroof",
            ],
            true,
          )}
          {text("budget", "Budget")}
          {select("siteType", "Site type", [
            "Apartment",
            "Builder floor",
            "Independent house",
            "Villa",
          ])}
          {select("segment", "Segment", ["Retail", "Pro-Retail", "Projects"])}
          {select("priority", "Priority prospect", ["High", "Medium", "Low"])}
          <div className="span-3">
            <ArchitectPicker
              on={d.architect}
              id={d.architectId}
              onToggle={(on) =>
                set((x) => ({
                  ...x,
                  architect: on,
                  source: on && !x.source ? "Architect reference" : x.source,
                }))
              }
              onPick={(id) => update("architectId", id)}
            />
          </div>
        </div>
        {text("note", "Note")}
        <label className="field">
          <span>Layout</span>
          <input
            type="file"
            aria-label="Layout"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError("");
            }}
          />
        </label>
        {error && (
          <p role="alert" className="msg">
            {error}
          </p>
        )}
        <button className="btn dark" type="submit">
          {uploading ? "Uploading layout…" : "Save opportunity"}
        </button>
      </fieldset>
    </form>
  );
}
