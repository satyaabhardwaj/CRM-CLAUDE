import { piMaths, piDownload } from "./pi";
import { useRef, useState } from "react";
import {
  Card,
  Facts,
  List,
  Pill,
  Dialog,
  FileLink,
  type Open,
} from "./components";
import {
  K,
  L,
  MODES,
  inPlay,
  money,
  pct,
  team,
  nextLine,
  owner,
  bankOnly,
  billing,
  record,
  validation,
  decide,
  approve,
  type Client,
  type Receipt,
} from "./model";
import type { Save } from "./store";
import { StableLabel } from "../../../backend/react/src/Shell";
const blank = (): Receipt => ({
  amount: 0,
  date: K().today(),
  mode: "",
  ref: "",
  kind: "bank",
  status: "Confirmed",
});
export function PaymentForm({
  clients,
  client,
  save,
  saving,
  writable,
  onSaved,
}: {
  clients: Client[];
  client?: Client;
  save: Save;
  saving: boolean;
  writable: boolean;
  onSaved?: (date: string) => void;
}) {
  const [draft, setDraft] = useState<Receipt>(() => ({
      ...blank(),
      billing: client?.billingPick,
    })),
    [id, setId] = useState(client?.id || ""),
    [error, setError] = useState(""),
    operation = useRef(crypto.randomUUID()),
    [uncertain, setUncertain] = useState(false);
  const picked = client || clients.find((c) => c.id === id);
  const change = (key: keyof Receipt, value: string | number) => {
    setError("");
    setDraft((d) => ({ ...d, [key]: value }));
  };
  async function submit() {
    if (!picked) {
      setError("Choose the client.");
      return;
    }
    const why = validation(draft);
    if (why) {
      setError(why);
      return;
    }
    const saved = await save(picked.id, operation.current, (c) =>
      record(c, draft),
    );
    if (saved) {
      onSaved?.(draft.date);
      setDraft({ ...blank(), billing: client?.billingPick });
      if (!client) setId("");
      operation.current = crypto.randomUUID();
      setUncertain(false);
    } else setUncertain(true);
  }
  return (
    <Card
      title={client ? "Record a payment" : "Enter a payment"}
      tone="teal"
      tag={picked ? nextLine(picked) : ""}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset
          disabled={saving || !writable || uncertain}
          className="a-form-fields"
        >
          <div className="g3">
            {!client && (
              <label className="field">
                Client
                <select
                  aria-label="Client"
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setError("");
                  }}
                >
                  <option value="">Choose</option>
                  {clients
                    .filter(inPlay)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.pid}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="field">
              Amount (₹)
              <input
                aria-label="Amount (₹)"
                inputMode="decimal"
                type="number"
                min="0.01"
                step="0.01"
                value={draft.amount || ""}
                onChange={(e) => change("amount", Number(e.target.value))}
              />
            </label>
            <label className="field">
              Date received
              <input
                type="date"
                value={draft.date}
                onChange={(e) => change("date", e.target.value)}
              />
            </label>
            {!bankOnly() && (
              <label className="field">
                Goes to
                <select
                  value={draft.kind}
                  onChange={(e) => change("kind", e.target.value)}
                >
                  <option value="bank">In bank</option>
                  <option value="md">Management</option>
                </select>
              </label>
            )}
            <label className="field">
              How it was paid
              <select
                value={draft.mode}
                onChange={(e) => change("mode", e.target.value)}
              >
                <option value="">Choose</option>
                {MODES.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Reference number
              <input
                value={draft.ref}
                onChange={(e) => change("ref", e.target.value)}
              />
            </label>
            {client && (
              <label className="field">
                Billing name
                <select
                  value={draft.billing}
                  onChange={(e) => change("billing", e.target.value)}
                >
                  {client.billing.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </fieldset>
        {picked && (
          <p className="sub">
            Received so far {K().money(money(picked).paid)} of{" "}
            {K().money(money(picked).t.total)} · {pct(money(picked).pct)} ·
            balance {K().money(money(picked).balance)}
          </p>
        )}
        {error && (
          <p className="a-error" role="alert">
            {error}
          </p>
        )}
        {uncertain && (
          <p role="status">
            This payment is awaiting confirmation. Retry the unchanged payment
            to reconcile safely.
          </p>
        )}
        <button
          className="btn dark"
          type="submit"
          disabled={saving || !writable}
        >
          <StableLabel
            busy={saving}
            idle={
              uncertain
                ? "Retry payment"
                : client
                  ? "Record payment"
                  : "Save payment"
            }
            working="Saving…"
          />
        </button>
      </form>
    </Card>
  );
}
export function Daily({
  clients,
  open,
  save,
  saving,
  writable,
}: {
  clients: Client[];
  open: Open;
  save: Save;
  saving: boolean;
  writable: boolean;
}) {
  const [day, setDay] = useState(K().today());
  const came = clients.flatMap((c) =>
    c.payment.receipts
      .filter((r) => r.status === "Confirmed" && r.date === day)
      .map((r, i) => ({ c, r, i })),
  );
  const sum = (kind: string) =>
    came
      .filter((x) => (x.r.kind === "md") === (kind === "md"))
      .reduce((n, x) => n + Number(x.r.amount), 0);
  return (
    <>
      <PaymentForm
        clients={clients}
        save={save}
        saving={saving}
        writable={writable}
        onSaved={setDay}
      />
      <List
        title={"Payments on " + K().day(day)}
        tag={
          <div className="flexrow">
            <span className="sub">
              Bank {K().short(sum("bank"))}
              {!bankOnly() && " · management " + K().short(sum("md"))}
            </span>
            <input
              type="date"
              aria-label="Day"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
        }
        empty="No payments entered for this day."
        items={came.map(({ c, r, i }) => ({
          id: c.id + ":" + i,
          name: c.name + " · " + K().money(r.amount),
          sub:
            (r.kind === "md" ? "Management" : "In bank") +
            " · " +
            r.mode +
            (r.ref ? " · " + r.ref : "") +
            " · by " +
            (r.by || "Accounts"),
          pill: <Pill tone="green">{pct(money(c).pct)}</Pill>,
          pick: () => open(c),
        }))}
      />
    </>
  );
}
async function factoryMail(c: Client, save: Save, operation: string) {
  const f = L().flow(c),
    d = L().dates(c);
  const body = [
    "An order has been shot to the Factory.",
    "",
    "Client: " + c.name,
    "Project: " + c.pid + "   Customer: " + c.cid,
    "Designer: " + (c.design.designer || "not allotted"),
    "Sales manager: " + (c.sm || owner(c)),
    "PDI approved: " + K().day(f.pdi.approvedAt || ""),
    "EPT signed: " +
      (f.ept.signedAt ? K().day(f.ept.signedAt) : "not recorded"),
    "Appliance list signed: " +
      (f.appliances.signedAt ? K().day(f.appliances.signedAt) : "not recorded"),
    "Design approved: " +
      (f.design.approvedAt ? K().day(f.design.approvedAt) : "not recorded"),
    "Order value: Rs " + L().totals(c).total,
    "Received so far: Rs " + L().collected(c),
    d
      ? "Dispatch: " +
        K().day(d.dispatch) +
        "   Handover: " +
        K().day(d.handover)
      : "Dates: not set",
    "",
    "Sent by the Magppie CRM.",
  ].join("\n");
  let state: Client["factoryMail"];
  try {
    const response = await fetch("/api/mail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "factory",
        subject: "Order shot to Factory: " + c.name + " (" + c.pid + ")",
        body,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const out = await response.json();
    state = out.sent
      ? { state: "sent", to: out.to, at: K().now(), test: !!out.test }
      : {
          state: "not sent",
          why:
            out.error === "no key"
              ? "Email is not switched on yet."
              : "Email could not be sent.",
        };
  } catch {
    state = {
      state: "unconfirmed",
      why: "Email result could not be confirmed. Check delivery before sending again.",
    };
  }
  await save(c.id, operation + ":mail", (latest) => {
    latest.factoryMail = state;
  });
}
export function Gates({
  client: c,
  save,
  saving,
  writable,
}: {
  client: Client;
  save: Save;
  saving: boolean;
  writable: boolean;
}) {
  const ids = useRef<Record<string, string>>({}),
    [working, setWorking] = useState(false);
  const run = async (key: string) => {
    if (working) return;
    setWorking(true);
    const id = (ids.current[key] ??= crypto.randomUUID());
    const saved = await save(c.id, id, (latest) => approve(latest, key));
    if (saved?.factoryMail?.state === "pending" && key === "factory")
      await factoryMail(saved, save, id);
    setWorking(false);
  };
  return (
    <Card
      title="Accounts approvals"
      tag={"% of the total payable " + K().money(L().totals(c).total)}
      tone="violet"
    >
      {L().GATES.map(([key, label]) => {
        const g = L().gate(c, key);
        return (
          <div className="line rule" key={key}>
            <span>
              <b>{label}</b>
              <span className="sub">
                {" "}
                · {g.pct}% · {K().money(g.need)}
              </span>
            </span>
            {g.approved ? (
              <Pill tone="green">Approved {K().day(g.approved.at)}</Pill>
            ) : g.ready ? (
              <button
                className="btn small dark"
                aria-label={"Approve " + label}
                disabled={saving || working || !writable}
                onClick={() => void run(key)}
              >
                Approve
              </button>
            ) : (
              <Pill tone={g.short ? "red" : "grey"}>
                {g.short
                  ? K().short(g.short) + " short"
                  : key === "factory"
                    ? "PDI not approved yet"
                    : "Earlier step first"}
              </Pill>
            )}
          </div>
        );
      })}
      <p className="hint">
        50% sends the order to Design. 80% opens the production drawing, and
        with the PDI approved, the factory. 100% opens dispatch.
      </p>
      {c.factoryMail && (
        <p role="status">
          Factory email: {c.factoryMail.state}
          {c.factoryMail.why ? " · " + c.factoryMail.why : ""}
        </p>
      )}
    </Card>
  );
}
export function PiCard({
  client: c,
  save,
  saving,
  writable,
}: {
  client: Client;
  save: Save;
  saving: boolean;
  writable: boolean;
}) {
  const [error, setError] = useState(""),
    busy = useRef(false);
  async function generate(key: string, name: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!window.jspdf)
        throw Error("PDF library unavailable. Reload and retry.");
      const copy = structuredClone(c);
      piDownload(copy, key, name);
      const entry = copy.pis!.at(-1)!;
      const saved = await save(c.id, crypto.randomUUID(), (latest) => {
        latest.pis = [...(latest.pis || []), entry];
      });
      setError(
        saved
          ? "PI prepared and history saved."
          : "PI prepared, but history could not be saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "PI could not be generated.");
    } finally {
      busy.current = false;
    }
  }
  return (
    <Card title="PI · amount asked is the bank amount">
      {[
        ["design", "Booking"],
        ["drawing", "Production"],
        ["dispatch", "Dispatch"],
      ].map(([key, name]) => {
        const p = piMaths(c, key);
        return (
          <div className="line rule" key={key}>
            <span>
              <b>
                {name} · {p.pct}%
              </b>
              <span className="sub">
                {" "}
                · due {K().money(p.due)} · received {K().money(p.got)} · net{" "}
                {K().money(p.net)}
              </span>
            </span>
            <button
              className="btn small"
              aria-label={"Download " + name + " PI"}
              disabled={saving || !writable}
              onClick={() => void generate(key, name)}
            >
              Download PI
            </button>
          </div>
        );
      })}
      {!!c.pis?.length && (
        <p className="hint">
          Made:{" "}
          {c.pis
            .slice(-3)
            .map((p) => p.stage + " " + K().day(p.at) + " " + K().money(p.net))
            .join(" · ")}
        </p>
      )}
      <p role="status">{error}</p>
    </Card>
  );
}
function Decision({
  client: c,
  kind,
  at,
  save,
  saving,
  writable,
  onClose,
}: {
  client: Client;
  kind: "booking" | "payment";
  at?: string;
  save: Save;
  saving: boolean;
  writable: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    operation = useRef(crypto.randomUUID()),
    intent = useRef<boolean | null>(null);
  async function run(approved: boolean) {
    if (!approved && !reason) {
      setError("Choose the rejection reason.");
      return;
    }
    if (intent.current !== null && intent.current !== approved) {
      setError("Retry the same decision first to confirm its result.");
      return;
    }
    intent.current = approved;
    const saved = await save(c.id, operation.current, (latest) =>
      decide(latest, kind, approved, reason, notes, at),
    );
    if (saved) onClose();
  }
  return (
    <Card title="Your decision" tone="teal">
      <button
        className="btn dark"
        disabled={saving || !writable}
        onClick={() => void run(true)}
      >
        {kind === "booking" ? "Approve booking" : "Confirm receipt"}
      </button>
      <label className="field">
        Rejection reason
        <select
          disabled={saving}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError("");
          }}
        >
          <option value="">Choose</option>
          <option>Not Received</option>
          <option>Information Incomplete</option>
        </select>
      </label>
      <label className="field">
        Accounts notes
        <input
          disabled={saving}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn warn"
        disabled={saving || !writable}
        onClick={() => void run(false)}
      >
        Reject
      </button>
    </Card>
  );
}
export function Details({
  client: c,
  kind,
  at,
  save,
  saving,
  writable,
  error,
  onClose,
}: {
  client: Client;
  kind: "expected" | "booking" | "payment";
  at?: string;
  save: Save;
  saving: boolean;
  writable: boolean;
  error: string;
  onClose: () => void;
}) {
  const m = money(c),
    t = m.t,
    pay = c.payment,
    dates = L().dates(c),
    receipt = pay.receipts.find(
      (r) => r.requestedAt === at && r.status === "Requested",
    );
  const sub =
    c.pid +
    " · " +
    c.cid +
    " · " +
    owner(c) +
    " · " +
    pay.plan +
    " plan · with " +
    team(c) +
    " · " +
    nextLine(c);
  return (
    <Dialog
      title={c.name}
      sub={sub}
      tag={
        <Pill tone={m.balance ? "red" : "green"}>
          {pct(m.pct)} received · {K().short(m.balance)} balance
        </Pill>
      }
      onClose={onClose}
      busy={saving}
    >
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
      {kind === "expected" ? (
        <div className="cols2 a-details">
          <div className="col">
            <Card title="Money" tone="green">
              <Facts
                items={[
                  ["Offer basic value", K().money(t.base)],
                  ["Total payable by client", K().money(t.total)],
                  [
                    "Bank · received of due",
                    K().money(m.bankGot) + " of " + K().money(t.bank),
                  ],
                  ...(!bankOnly()
                    ? ([
                        [
                          "Management · received of due",
                          K().money(m.mgmtGot) + " of " + K().money(t.mgmt),
                        ],
                      ] as [string, string][])
                    : []),
                  ["Received", K().money(m.paid) + " · " + pct(m.pct)],
                  ["Balance", K().money(m.balance)],
                  ...(!bankOnly()
                    ? ([
                        [
                          "Bank % · free accessories %",
                          (t.bankPct == null ? "not set" : t.bankPct + "%") +
                            " · " +
                            (t.faPct == null
                              ? t.freight
                                ? "amount typed before 19 Oct"
                                : "not set"
                              : t.faPct + "%"),
                        ],
                      ] as [string, string][])
                    : []),
                  [
                    "Token promised",
                    pay.tokenPlan
                      ? K().money(pay.tokenPlan) +
                        (pay.tokenBy ? " by " + K().day(pay.tokenBy) : "")
                      : "",
                  ],
                  [
                    "Rest of booking amount by",
                    pay.expectedBy ? K().day(pay.expectedBy) : "",
                  ],
                ]}
              />
              {L()
                .ledger(c)
                .map((s) => (
                  <div className="line rule" key={s.name}>
                    <span>
                      <b>{s.name}</b> · {s.percent}% · {K().money(s.amount)}
                    </span>
                    <Pill tone={s.due === 0 && s.amount ? "green" : "grey"}>
                      {s.due === 0 && s.amount
                        ? "Paid"
                        : s.paid
                          ? K().money(s.due) + " left"
                          : "Not paid"}
                    </Pill>
                  </div>
                ))}
              {pay.receipts.map((r, i) => (
                <div className="line rule" key={i}>
                  <span>
                    <b>{K().money(r.amount)}</b> · {K().day(r.date)} · {r.mode}{" "}
                    · {r.ref} · {r.kind === "md" ? "management" : "in bank"}
                  </span>
                  <Pill
                    tone={
                      r.status === "Confirmed"
                        ? "green"
                        : r.status === "Requested"
                          ? "yellow"
                          : "red"
                    }
                  >
                    {r.status === "Requested" ? "To confirm" : r.status}
                  </Pill>
                </div>
              ))}
            </Card>
            <PiCard
              client={c}
              save={save}
              saving={saving}
              writable={writable}
            />
          </div>
          <div className="col">
            <Gates client={c} save={save} saving={saving} writable={writable} />
            <PaymentForm
              clients={[c]}
              client={c}
              save={save}
              saving={saving}
              writable={writable}
            />
          </div>
        </div>
      ) : (
        <div className="cols2 a-details">
          <Card
            title={
              kind === "booking"
                ? "Booking sent by Sales"
                : "Payment sent by Sales"
            }
            tone={kind === "booking" ? "blue" : "green"}
          >
            {kind === "booking" ? (
              <>
                <Facts
                  items={[
                    ["Billing name", billing(c)],
                    ["Site", c.city + " · " + c.product],
                    [
                      "Products",
                      c.order.products
                        .map((p) => p.product + " " + K().money(p.value))
                        .join(", "),
                    ],
                    ["Installation", K().money(c.order.installation || 0)],
                    ["Offer basic value", K().money(t.base)],
                    ["GST on the bank part", K().money(t.tax)],
                    ["Received in bank (due)", K().money(t.bank)],
                    ["Management discount (due)", K().money(t.md)],
                    ["Free accessories", K().money(t.freight)],
                    ["Total payable by client", K().money(t.total)],
                    [
                      "Payment plan",
                      L().PLANS[pay.plan].label + " · " + c.approvals.plan,
                    ],
                    [
                      "Stage amounts",
                      L()
                        .shares(c)
                        .map((s) => s.name + " " + K().money(s.amount))
                        .join(", "),
                    ],
                    ["Confirmed so far", K().money(m.paid)],
                    [
                      "Booking amount left",
                      K().money(L().bookingLeft(c)) +
                        (pay.expectedBy
                          ? " · by " + K().day(pay.expectedBy)
                          : ""),
                    ],
                    ["Handover", dates ? K().day(dates.handover) : ""],
                    ["Timeline · Design", c.approvals.timeline],
                  ]}
                />
                <FileLink
                  client={c}
                  name={c.docs.quotation}
                  label="Signed quotation"
                />
                <FileLink
                  client={c}
                  name={c.docs.drawing}
                  label="Signed drawing"
                />
              </>
            ) : receipt ? (
              <>
                <Facts
                  items={[
                    ["Amount", K().money(receipt.amount)],
                    [
                      "Goes to",
                      receipt.kind === "md" ? "Management discount" : "In bank",
                    ],
                    ["Date", K().day(receipt.date)],
                    [
                      "Billing for this payment",
                      c.billing.find((b) => b.id === receipt.billing)?.name ||
                        billing(c),
                    ],
                    ["How it was paid", receipt.mode],
                    ["Reference number", receipt.ref],
                    ["Billing name", billing(c)],
                    ["Payment plan", L().PLANS[pay.plan].label],
                    ["Total order value", K().money(t.total)],
                    ["Booking share", K().money(L().bookingDue(c))],
                    ["Confirmed so far", K().money(m.paid)],
                    ["Booking amount left", K().money(L().bookingLeft(c))],
                  ]}
                />
                <FileLink
                  client={c}
                  name={receipt.proof}
                  label="Payment proof"
                />
              </>
            ) : (
              <p>This receipt has already been decided.</p>
            )}
          </Card>
          {(kind === "booking" || receipt) && (
            <Decision
              client={c}
              kind={kind}
              at={at}
              save={save}
              saving={saving}
              writable={writable}
              onClose={onClose}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}
