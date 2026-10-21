import { useState } from "react";
import { rules, type FormProps } from "./model";
import { Button, Card, Field, Select, Voice } from "./ui";
export const outcomes = [
  ["Spoke to client", "Spoke to client"],
  ["No answer", "RNR"],
  ["Asked to call later", "Rescheduled"],
] as const;
export function ContactForm({
  c,
  ctx,
  qualified = false,
}: FormProps & { qualified?: boolean }) {
  const empty = { type: "Call", outcome: "", next: "", note: "" };
  const [d, set] = useState(empty),
    [error, setError] = useState("");
  const field = (key: keyof typeof d, v: string) => {
    set((x) => ({ ...x, [key]: v }));
    setError("");
  };
  return (
    <Card title={qualified ? "Call result" : "Log a contact"}>
      <div className="g2">
        {!qualified && (
          <Select
            label="What you did"
            value={d.type}
            options={["Call", "Meeting", "WhatsApp", "Site visit"]}
            onChange={(v) => field("type", v)}
            placeholder={false}
          />
        )}
        <Select
          label={qualified ? "Call result" : "What happened"}
          value={d.outcome}
          options={outcomes}
          onChange={(v) => field("outcome", v)}
        />
        <Field
          label="Next follow-up · date and time"
          value={d.next}
          type="datetime-local"
          immediate
          onCommit={(v) => field("next", v)}
        />
      </div>
      <Field
        label="Note"
        value={d.note}
        immediate
        onCommit={(v) => field("note", v)}
      />
      <Voice
        onText={(text) =>
          set((x) => ({ ...x, note: (x.note + " " + text).trim() }))
        }
      />
      <Button
        tone="line"
        onClick={() => {
          if (!d.outcome) {
            setError("Choose the call result first.");
            return;
          }
          ctx.update(() => rules().logContact(c, d));
          set(empty);
          setError("");
        }}
      >
        {qualified ? "Save call" : "Save"}
      </Button>
      {error && (
        <p role="alert" className="msg">
          {error}
        </p>
      )}
      {c.retry && (
        <p className="hint">
          RNR {c.retry.tries} time(s). Call again by{" "}
          {new Date(c.retry.dueAt).toLocaleString()}.
        </p>
      )}
      {c.contacts.slice(0, 3).map((e, i) => (
        <div className="hint" key={e.at + i}>
          {new Date(e.at).toLocaleString()} · {e.type} ·{" "}
          {outcomes.find((o) => o[0] === e.outcome)?.[1] || e.outcome}
          {e.note && " · " + e.note}
        </div>
      ))}
    </Card>
  );
}
