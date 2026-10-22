import { useState } from "react";
import { Card, Facts, List, Pill, type Open } from "./components";
import {
  K,
  L,
  STAGES,
  hasOrder,
  inPlay,
  money,
  pct,
  team,
  nextLine,
  nextGate,
  bookOf,
  line,
  owner,
  bankOnly,
  csv,
  download,
  type Client,
} from "./model";
export function Summary({ clients }: { clients: Client[] }) {
  const orders = clients.filter(
      (c) => c.order.products.length && L().totals(c).total > 0 && bookOf(c),
    ),
    live = orders.filter((c) => bookOf(c) !== "Cancelled");
  const obv = (list: Client[]) =>
    list.reduce((n, c) => n + L().totals(c).base, 0);
  const type = (c: Client) => c.order.type || "Retail";
  const rows = [
    "OCF pending",
    "Booked · OCF in",
    "With Design",
    "In production",
    "Dispatched",
    "Cancelled",
  ];
  const sums = live.map(money),
    sum = (f: (m: ReturnType<typeof money>) => number) =>
      sums.reduce((n, m) => n + f(m), 0),
    target = (key: string) =>
      live.reduce((n, c) => n + L().gate(c, key).short, 0);
  const months: Record<string, { Retail: number; Project: number }> = {};
  orders
    .filter((c) => L().gateOpen(c, "dispatch"))
    .forEach((c) => {
      const month = c.gates.dispatch.at.slice(0, 7);
      months[month] ??= { Retail: 0, Project: 0 };
      months[month][type(c) === "Project" ? "Project" : "Retail"] +=
        L().totals(c).base;
    });
  const orderRow = (label: string, list: Client[]) => [
    label,
    K().lakh(obv(list.filter((c) => type(c) === "Retail"))),
    K().lakh(obv(list.filter((c) => type(c) === "Project"))),
    K().lakh(obv(list)),
    list.length,
  ];
  return (
    <div className="cols2 a-summary">
      <div className="col">
        <Card title="Order book · offer basic value" tag="₹ lakhs">
          <Table
            headers={["Where", "Retail", "Project", "Total", "Orders"]}
            rows={[
              ...rows.map((r) =>
                orderRow(
                  r,
                  orders.filter((c) => bookOf(c) === r),
                ),
              ),
              orderRow("Total (not cancelled)", live),
            ]}
          />
        </Card>
        <Card title="Dispatched by month" tone="violet" tag="₹ lakhs">
          <Table
            headers={["Month", "Retail", "Project", "Total"]}
            rows={Object.keys(months)
              .sort()
              .map((k) => [
                new Date(k + "-01T00:00:00").toLocaleDateString("en-IN", {
                  month: "long",
                  year: "numeric",
                }),
                K().lakh(months[k].Retail),
                K().lakh(months[k].Project),
                K().lakh(months[k].Retail + months[k].Project),
              ])}
          />
          {!Object.keys(months).length && (
            <p className="empty">Nothing dispatched yet.</p>
          )}
        </Card>
      </div>
      <Card title="Money · all live orders" tone="green" tag="₹ lakhs">
        <Facts
          items={[
            ["Total payable", K().short(sum((m) => m.t.total))],
            ["Received", K().short(sum((m) => m.paid))],
            [
              "Bank · received of due",
              K().short(sum((m) => m.bankGot)) +
                " of " +
                K().short(sum((m) => m.t.bank)),
            ],
            ...(!bankOnly()
              ? ([
                  [
                    "Management · received of due",
                    K().short(sum((m) => m.mgmtGot)) +
                      " of " +
                      K().short(sum((m) => m.t.mgmt)),
                  ],
                ] as [string, string][])
              : []),
            ["Balance", K().short(sum((m) => m.balance))],
            ["Still to come in bank", K().short(sum((m) => m.bankDue))],
            ...(!bankOnly()
              ? ([
                  [
                    "Still to come as management",
                    K().short(sum((m) => m.mgmtDue)),
                  ],
                ] as [string, string][])
              : []),
            [
              "Needed to reach the booking share (50%)",
              K().short(target("design")),
            ],
            ["Needed to reach 80% (production)", K().short(target("drawing"))],
            ["Needed to reach 100% (dispatch)", K().short(target("dispatch"))],
          ]}
        />
      </Card>
    </div>
  );
}
export function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="a-table-scroll">
      <table className="a-table cardify">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td data-label={headers[j]} key={j}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Clients({ clients, open }: { clients: Client[]; open: Open }) {
  const [query, setQuery] = useState("");
  const rows = clients
    .filter(hasOrder)
    .filter((c) =>
      (c.name + " " + c.pid + " " + c.cid)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const sum = (f: (m: ReturnType<typeof money>) => number) =>
    rows.reduce((n, c) => n + f(money(c)), 0);
  return (
    <>
      <div className="a-toolbar">
        <input
          aria-label="Search clients"
          placeholder="Search a client, project or customer number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="btn" onClick={() => setQuery("")}>
            Clear
          </button>
        )}
        <span className="sub">
          {rows.length} order(s) · total {K().short(sum((m) => m.t.total))} ·
          received {K().short(sum((m) => m.paid))} · balance{" "}
          {K().short(sum((m) => m.balance))}
        </span>
      </div>
      <section className="card a-table-scroll">
        <table className="a-table cardify">
          <thead>
            <tr>
              {[
                "Client",
                "Total payable",
                "Bank",
                ...(!bankOnly() ? ["Management"] : []),
                "Received",
                "Balance",
                "Team",
                "Next approval",
              ].map((h) => (
                <th scope="col" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const m = money(c),
                g = nextGate(c);
              return (
                <tr key={c.id}>
                  <td data-label="Client">
                    <button className="a-link" onClick={() => open(c)}>
                      {c.name}
                    </button>
                    <small>
                      {c.pid} · {owner(c)}
                    </small>
                  </td>
                  <td data-label="Total payable">
                    {K().lakh(m.t.total)}
                    <small>OBV {K().lakh(m.t.base)}</small>
                  </td>
                  <td data-label="Bank">
                    {K().lakh(m.bankGot)}
                    <small>of {K().lakh(m.t.bank)}</small>
                  </td>
                  {!bankOnly() && (
                    <td data-label="Management">
                      {K().lakh(m.mgmtGot)}
                      <small>of {K().lakh(m.t.mgmt)}</small>
                    </td>
                  )}
                  <td data-label="Received">
                    {pct(m.pct)}
                    <small>{K().lakh(m.paid)} in</small>
                  </td>
                  <td data-label="Balance">{K().lakh(m.balance)}</td>
                  <td data-label="Team">{team(c)}</td>
                  <td data-label="Next approval">
                    {g?.label || "All done"}
                    <small>{nextLine(c)}</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <p className="empty">
            {query ? "No client matches your search." : "No orders yet."}
          </p>
        )}
      </section>
      <p className="hint">
        Amounts in lakhs, 2 decimals. Team: under 50% received the order is with
        Sales, from 50% with Design.
      </p>
    </>
  );
}
export function Approvals({
  clients,
  open,
}: {
  clients: Client[];
  open: Open;
}) {
  return (
    <div className="a-lists four">
      {L().GATES.map(([key, label]) => (
        <List
          key={key}
          title={label}
          empty={
            key === "factory"
              ? "Nothing ready. Needs 80% in and the PDI approved."
              : "Nothing ready to approve."
          }
          items={clients
            .filter(hasOrder)
            .filter((c) => L().gate(c, key).ready)
            .map((c) => ({
              id: c.id,
              name: c.name,
              sub:
                owner(c) +
                " · " +
                K().short(L().collected(c)) +
                " of " +
                K().short(L().totals(c).total) +
                " in · needs " +
                L().gate(c, key).pct +
                "%",
              pill: <Pill tone="blue">Ready</Pill>,
              pick: () => open(c),
            }))}
        />
      ))}
    </div>
  );
}
export function Booking({ clients, open }: { clients: Client[]; open: Open }) {
  const owing = clients
    .filter(
      (c) => ["token", "booked"].includes(c.stage) && L().bookingLeft(c) > 0,
    )
    .sort((a, b) =>
      (L().payDue(a) || "9999").localeCompare(L().payDue(b) || "9999"),
    );
  const payments = clients
    .filter(inPlay)
    .flatMap((c) =>
      c.payment.receipts
        .filter((r) => r.status === "Requested")
        .map((r) => ({ c, r })),
    )
    .sort((a, b) =>
      (a.r.requestedAt || "").localeCompare(b.r.requestedAt || ""),
    );
  return (
    <div className="a-lists">
      <List
        title="Payments expected"
        empty="No payments are expected."
        items={owing.map((c) => {
          const by = L().payDue(c),
            late = by
              ? Math.round(
                  (Date.parse(K().today()) - Date.parse(by)) / 86400000,
                )
              : 0;
          return {
            id: c.id,
            name:
              c.name +
              " · " +
              K().short(
                !L().tokenIn(c)
                  ? Number(c.payment.tokenPlan) || L().bookingLeft(c)
                  : L().bookingLeft(c),
              ),
            sub:
              owner(c) +
              " · " +
              (!L().tokenIn(c)
                ? bankOnly()
                  ? "first payment"
                  : "token"
                : "rest of booking amount") +
              " · received " +
              K().short(L().collected(c)),
            pill: (
              <Pill tone={late > 0 ? "red" : "grey"}>
                {!by
                  ? "No date"
                  : late > 0
                    ? late + " day(s) overdue"
                    : late === 0
                      ? "Due today"
                      : "Due " + K().day(by)}
              </Pill>
            ),
            pick: () => open(c),
          };
        })}
      />
      <List
        title="Sales says paid · to confirm"
        empty="Nothing from Sales to confirm."
        items={payments.map(({ c, r }, i) => ({
          id: c.id + ":" + i,
          name: c.name,
          sub:
            owner(c) +
            " · " +
            (r.mode || "Mode not given") +
            " · " +
            r.ref +
            " · " +
            K().day(r.date),
          pill: <Pill tone="blue">{K().short(r.amount)}</Pill>,
          pick: () => open(c, "payment", r.requestedAt),
        }))}
      />
      <List
        title="Bookings to approve"
        empty="No bookings are waiting."
        items={clients
          .filter(
            (c) =>
              ["token", "booked"].includes(c.stage) &&
              c.approvals.booking === "Pending",
          )
          .map((c) => ({
            id: c.id,
            name: c.name,
            sub:
              owner(c) +
              " · " +
              K().short(L().totals(c).total) +
              " · " +
              c.payment.plan +
              " plan · collected " +
              K().short(L().collected(c)),
            pill: <Pill tone="blue">Pending</Pill>,
            pick: () => open(c, "booking"),
          }))}
      />
    </div>
  );
}
export function Stage({
  clients,
  tab,
  open,
}: {
  clients: Client[];
  tab: string;
  open: Open;
}) {
  const stage = STAGES.find((s) => s[0] === tab)!;
  const rows = clients
    .filter((c) => inPlay(c) && c.order.products.length)
    .map((c) => ({ c, x: line(c, stage[2]) }))
    .filter((r) => r.x);
  return (
    <div className="a-lists">
      {["now", "soon", "done"].map((state, i) => (
        <List
          key={state}
          title={[stage[1] + " payment due now", "Coming up", "Received"][i]}
          empty={
            [
              "Nobody has to pay at this stage right now.",
              "Nothing coming up.",
              "Nothing received at this stage yet.",
            ][i]
          }
          items={rows
            .filter(({ x }) =>
              state === "now"
                ? x!.now
                : state === "done"
                  ? x!.done
                  : !x!.now && !x!.done,
            )
            .sort((a, b) =>
              state === "now"
                ? (a.x!.by || "9999").localeCompare(b.x!.by || "9999")
                : 0,
            )
            .map(({ c, x }) => ({
              id: c.id,
              name: c.name + " · " + K().short(x!.due || x!.amount),
              sub:
                owner(c) +
                " · " +
                c.payment.plan +
                " plan · " +
                x!.percent +
                "% of " +
                K().short(L().totals(c).total) +
                " · paid " +
                K().short(x!.paid),
              pill: (
                <Pill
                  tone={
                    state === "done"
                      ? "green"
                      : x!.by && x!.by < K().today()
                        ? "red"
                        : "grey"
                  }
                >
                  {state === "done"
                    ? "Paid"
                    : state === "soon"
                      ? "An earlier stage is unpaid"
                      : (x!.by && x!.by < K().today() ? "Overdue · " : "Due ") +
                        (x!.by ? K().day(x!.by) : "No date")}
                </Pill>
              ),
              pick: () => open(c),
            }))}
        />
      ))}
    </div>
  );
}
export function Master({ clients }: { clients: Client[] }) {
  const [feedback, setFeedback] = useState("");
  const columns = window.AccountsMasterColumns.filter(
      ([name]) =>
        !bankOnly() ||
        !["Management discount", "Free accessories"].includes(name),
    ),
    rows = clients
      .filter((c) => c.stage !== "bin")
      .sort((a, b) => a.pid.localeCompare(b.pid));
  return (
    <>
      <div className="page-h">
        <div>
          <h1>Master data</h1>
          <p>
            {rows.length} clients · {columns.length} fields · scroll sideways
          </p>
        </div>
        <button
          className="btn dark"
          onClick={() => {
            const cell = (v: unknown) =>
              /^₹[\d,]+$/.test(String(v))
                ? Number(String(v).replace(/[^\d]/g, ""))
                : String(v ?? "")
                    .replace(/₹/g, "")
                    .trim();
            download(
              csv([
                columns.map((c) => c[0]),
                ...rows.map((c) => columns.map(([, get]) => cell(get(c)))),
              ]),
              "magppie-crm-" + K().today() + ".csv",
            );
            setFeedback("CSV prepared. Check browser downloads.");
          }}
        >
          Download all
        </button>
      </div>
      <p role="status">{feedback}</p>
      <section className="card master">
        <table>
          <thead>
            <tr>
              {columns.map(([name]) => (
                <th key={name} scope="col">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                {columns.map(([name, get]) => (
                  <td key={name}>{String(get(c) ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
