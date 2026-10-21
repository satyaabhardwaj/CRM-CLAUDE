// @vitest-environment jsdom
import { beforeAll, it, expect, vi } from "vitest";
import { installRules, client, payment } from "./setup";
import { piDownload } from "../src/pi";
beforeAll(installRules);
it.each(["design", "drawing", "dispatch"])(
  "preserves PDF drawing commands and PI record for %s",
  (key) => {
    vi.spyOn(window.Kit, "now").mockReturnValue("2026-10-19T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const calls: unknown[][] = [];
    class Pdf {
      constructor(options: unknown) {
        calls.push(["construct", options]);
      }
    }
    for (const name of [
      "setLineWidth",
      "line",
      "setFillColor",
      "rect",
      "setFont",
      "setFontSize",
      "setTextColor",
      "text",
      "save",
    ])
      Object.assign(Pdf.prototype, {
        [name]: (...args: unknown[]) => calls.push([name, ...args]),
      });
    window.jspdf = { jsPDF: Pdf };
    const original = client({
        payment: {
          plan: "AVP",
          receipts: [payment(7000), payment(2000, "md")],
        },
        order: {
          products: [{ product: "Kitchen", value: 110001 }],
          installation: 2222,
          bankPct: 40,
          faPct: 5,
        },
      }),
      copy = structuredClone(original);
    window.AccountsParts.piDownload(original, key, "Booking");
    const legacy = structuredClone(calls);
    calls.length = 0;
    piDownload(copy, key, "Booking");
    expect(calls).toEqual(legacy);
    expect(copy.pis).toEqual(original.pis);
    vi.useRealTimers();
    vi.restoreAllMocks();
  },
);
it("does not append a PI history record if PDF library is missing", () => {
  window.jspdf = undefined;
  const c = client();
  expect(() => piDownload(c, "design", "Booking")).toThrow(
    "PDF export is unavailable",
  );
  expect(c.pis || []).toHaveLength(0);
});
