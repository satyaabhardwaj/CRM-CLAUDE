import type { ReactNode } from "react";
import type { DesignClient as Client } from "./model";
import { rules } from "./model";
import { cameAt } from "./selectors";
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value || "Not given"}</b>
        </div>
      ))}
    </div>
  );
}
export function TopFacts({ c }: { c: Client }) {
  const L = rules(),
    K = window.Kit,
    b = c.design.brief,
    p = c.design.proposals.at(-1),
    t = L.totals(c),
    post = L.handed(c),
    last = L.lastSpoke(c);
  return (
    <section className="card topfacts">
      <Facts
        items={[
          ["Sales person", window.People.owner(c)],
          ["Designer", c.design.designer || "Not allotted"],
          ["Client phone", c.phone],
          ["Last contacted", last ? K.dayTime(last) : "Not spoken yet"],
          [
            "Next follow-up",
            c.nextFollowUp ? K.when(c.nextFollowUp) : "None set",
          ],
          ["Came to Design", cameAt(c) ? K.dayTime(cameAt(c)) : "Not recorded"],
          post
            ? ["Order value", "₹" + t.total.toLocaleString("en-IN")]
            : ["Budget", c.budget],
          post
            ? [
                "Received",
                "₹" +
                  L.collected(c).toLocaleString("en-IN") +
                  " · " +
                  (t.total ? Math.round((L.collected(c) / t.total) * 100) : 0) +
                  "%",
              ]
            : [
                "Latest proposal",
                p
                  ? "V" +
                    p.v +
                    " · ₹" +
                    Number(p.amount).toLocaleString("en-IN")
                  : "None yet",
              ],
          [
            "Area",
            b.sqft
              ? Number(b.sqft).toLocaleString("en-IN") + " sq ft"
              : "Not given",
          ],
          post
            ? [
                "Handover",
                c.timeline.handover ? K.day(c.timeline.handover) : "Not set",
              ]
            : [
                "Design needed by",
                b.requiredOn ? K.day(b.requiredOn) : "Not given",
              ],
          ["Segment", c.segment],
          ["Priority", c.priority],
        ]}
      />
    </section>
  );
}
