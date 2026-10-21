// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from "vitest";
import { installRules, client, payment } from "./setup";
import {
  L,
  money,
  line,
  record,
  validation,
  approve,
  decide,
  bookOf,
  normalize,
  csv,
  type Client,
} from "../src/model";
import { piMaths } from "../src/pi";
beforeAll(installRules);
describe("financial parity with existing Accounts rules", () => {
  it.each(["SM", "AVP", "Founder"])(
    "preserves % rules, sequential allocation and PI rounding for %s",
    (plan) => {
      for (const value of [100, 100000, 2315312, 6650000]) {
        const c = client({
          order: { products: [{ value }], bankPct: 30, faPct: 6 },
          payment: {
            plan,
            receipts: [
              payment(12345),
              payment(7654, "md"),
              { ...payment(99999), status: "Requested" },
            ],
          },
        });
        const old = window.AccountsParts as typeof window.AccountsParts & {
          money(c: Client): ReturnType<typeof money>;
          line(c: Client, name: string): ReturnType<typeof line>;
        };
        expect(money(c)).toEqual(old.money(c));
        for (const name of ["Booking", "EPT", "Production", "PDI", "EHOD"])
          expect(line(c, name)).toEqual(old.line(c, name));
        expect(
          L()
            .shares(c)
            .reduce((n, s) => n + s.amount, 0),
        ).toBe(L().totals(c).total);
        const p = piMaths(c, "drawing");
        expect(p).toEqual(window.AccountsParts.piMaths(c, "drawing"));
        expect(p.due).toBe(
          Math.round((L().totals(c).bank * L().gatePct(c, "drawing")) / 100),
        );
        expect(p.net).toBe(Math.max(0, p.due - 12345));
        expect(p.netBase + p.netGst).toBe(p.net);
      }
    },
  );
  it("retains known sheet rounding and old typed-amount behavior", () => {
    const t = L().totals(
      client({
        order: { products: [{ value: 2315312 }], bankPct: 30, faPct: 6 },
      }),
    );
    expect([t.bankBase, t.tax, t.freight, t.bank, t.md, t.mgmt]).toEqual([
      694594, 125027, 97243, 819620, 1620718, 1717962,
    ]);
    expect(
      L().totals(
        client({
          order: { products: [{ value: 1000000 }], md: 100000, freight: 20000 },
        }),
      ),
    ).toMatchObject({ total: 1182000, bank: 1062000, mgmt: 120000 });
  });
  it("ignores requested/rejected receipts; allocation clamps overpayment balances", () => {
    const c = client();
    c.payment.receipts = [
      payment(999999),
      { ...payment(1e6), status: "Requested" },
      { ...payment(1e6), status: "Rejected" },
    ];
    expect(money(c).paid).toBe(999999);
    expect(money(c).balance).toBe(0);
    expect(
      L()
        .ledger(c)
        .every((r) => r.due === 0),
    ).toBe(true);
  });
  it("normalizes a clone, without mutating saved historical or unrelated fields", () => {
    const raw = {
      rev: 4,
      clients: [
        {
          id: "a",
          name: "A",
          pid: "P-1",
          cid: "C-1",
          stage: "token",
          custom: { keep: true },
        } as unknown as Client,
      ],
      settings: { keep: true },
    };
    const before = JSON.stringify(raw);
    normalize(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
describe("payment and approval transitions", () => {
  it("validates positive finite money, real dates and modes", () => {
    for (const amount of [0, -1, NaN, Infinity])
      expect(validation(payment(amount))).not.toBe("");
    expect(validation({ ...payment(), date: "2026-02-30" })).not.toBe("");
    expect(validation({ ...payment(), mode: "" })).not.toBe("");
    expect(validation(payment())).toBe("");
  });
  it("records bank and management independently and preserves unknown client data", () => {
    const c = client({ custom: { keep: 42 } });
    record(c, payment(100));
    record(c, payment(200, "md"));
    expect(L().received(c)).toEqual({ bank: 100, md: 200 });
    expect(c.custom).toEqual({ keep: 42 });
    expect(c.news?.[0].from).toBe("Accounts");
  });
  it("requires money and explicit approval, then PDI before factory", () => {
    const c = client();
    expect(() => approve(c, "design")).toThrow();
    record(c, payment());
    expect(L().gate(c, "design").ready).toBe(true);
    expect(bookOf(c)).toBe("OCF pending");
    approve(c, "design");
    expect(bookOf(c)).toBe("With Design");
    record(c, payment(35400));
    approve(c, "drawing");
    expect(() => approve(c, "factory")).toThrow();
    L().flow(c).pdi.approvedAt = "2026-10-19";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    approve(c, "factory");
    expect(c.factoryAt).toBeTruthy();
    expect(c.factoryMail?.state).toBe("pending");
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => approve(c, "dispatch")).toThrow();
    record(c, payment(23600));
    approve(c, "dispatch");
    expect(bookOf(c)).toBe("Dispatched");
    vi.unstubAllGlobals();
  });
  it("rejects stale duplicate decisions and requires rejection reasons", () => {
    const c = client();
    c.payment.receipts = [
      { ...payment(), status: "Requested", requestedAt: "request-1" },
    ];
    expect(() => decide(c, "payment", false, "", "", "request-1")).toThrow();
    decide(c, "payment", false, "Not Received", "Note", "request-1");
    expect(c.payment.receipts[0]).toMatchObject({
      status: "Rejected",
      reason: "Not Received",
      notes: "Note",
    });
    expect(() => decide(c, "payment", true, "", "", "request-1")).toThrow();
    c.approvals.booking = "Pending";
    decide(c, "booking", true, "", "");
    expect(c.approvals.booking).toBe("Approved");
    expect(() => decide(c, "booking", true, "", "")).toThrow();
  });
  it("retains all master data columns and prevents CSV formula execution", () => {
    expect(window.AccountsMasterColumns).toHaveLength(52);
    expect(csv([["=1+1", 'a"b']])).toBe('\uFEFF"\'=1+1","a""b"');
  });
});
