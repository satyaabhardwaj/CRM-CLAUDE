import { architects, assignArchitect, type FormProps } from "./model";
import { Check, Select } from "./ui";
export function ArchitectPicker({
  on,
  id,
  onToggle,
  onPick,
}: {
  on: boolean;
  id: string;
  onToggle: (v: boolean) => void;
  onPick: (v: string) => void;
}) {
  const list = architects()
      .filter((a) => !a.archived || a.id === id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
    a = list.find((a) => a.id === id);
  return (
    <div className="soft">
      <Check
        label="An architect is involved"
        checked={on}
        onChange={onToggle}
      />
      {on && (
        <>
          <Select
            label="Architect"
            value={id}
            options={list.map((a) => [
              a.id,
              a.name +
                (a.firm ? " · " + a.firm : "") +
                " · " +
                a.rate +
                "%" +
                (a.archived ? " · Archived" : ""),
            ])}
            onChange={onPick}
            placeholder="Choose the architect"
          />
          {a && (
            <div className="facts">
              <div>
                <span>Firm</span>
                <b>{a.firm || "Not given"}</b>
              </div>
              <div>
                <span>Phone</span>
                <b>{a.phone || "Not given"}</b>
              </div>
              <div>
                <span>Commission</span>
                <b>{a.rate}%</b>
              </div>
            </div>
          )}
          <div className="sub">
            The fee is inside the offer basic value. The client is not shown it.
          </div>
        </>
      )}
    </div>
  );
}
export function ClientArchitect({ c, ctx }: FormProps) {
  return (
    <ArchitectPicker
      on={!!c.architectInvolved}
      id={c.architectId || ""}
      onToggle={(on) =>
        ctx.update(() => assignArchitect(c, c.architectId || "", on))
      }
      onPick={(id) => ctx.update(() => assignArchitect(c, id))}
    />
  );
}
