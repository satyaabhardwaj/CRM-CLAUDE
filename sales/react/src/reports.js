const L = window.SalesLogic,
  Kit = window.Kit,
  People = window.People;
export function clientReport(c) {
  const t = L.totals(c),
    d = L.dates(c),
    b = c.design.brief,
    pick =
      c.billing.find(function (x) {
        return x.id === c.billingPick;
      }) || c.billing[0];
  const day = function (v) {
    return v ? Kit.day(v) : "";
  };
  const stage =
    {
      qualified: "Qualified lead",
      design: "In design",
      booked: "Booked, collecting",
      post: "Post-design",
      lost: "Disqualified",
      bin: "In the bin",
    }[c.stage] || c.stage;
  return [
    {
      heading: "Client",
      rows: [
        ["Name", c.name],
        ["Project ID", c.pid],
        ["Customer ID", c.cid],
        ["Stage", stage],
        ["Phone", c.phone],
        ["City", c.city],
        ["Email", c.email],
        [
          "Site address",
          [c.siteAddress, c.sitePin, c.siteState].filter(Boolean).join(", "),
        ],
        ["Product", c.product],
        ["Source", c.source + (c.psm ? ", passed by " + c.psm : "")],
        ["Segment", c.segment],
        ["Priority", c.priority],
        ["Trust", c.trust ? c.trust + "/10" : ""],
        ["Budget given", c.budget],
        ["Sales person", People.owner(c)],
        ["Designer", c.design.designer],
        ["Lead received", day(c.receivedAt)],
        ["First conversation", day(c.spokeAt)],
        ["Next follow-up", c.nextFollowUp ? Kit.when(c.nextFollowUp) : ""],
        ["Note", c.note],
      ],
    },
    {
      heading: "Billing",
      rows: c.billing
        .map(function (x) {
          return [
            x.id + (x.id === pick.id ? " (in use)" : ""),
            [
              x.name,
              x.gst ? "GST " + x.gst : "",
              x.pan ? "PAN " + x.pan : "",
              x.sameAsSite ? c.siteAddress : x.address,
            ]
              .filter(Boolean)
              .join(", "),
          ];
        })
        .concat(
          (c.people || []).map(function (p) {
            return [
              "Other contact",
              [p.name, p.relation, p.phone].filter(Boolean).join(", "),
            ];
          }),
        ),
    },
    !t.total
      ? null
      : {
          heading: "Order",
          rows: [
            [
              "Kitchen" + (Kit.bankOnly() ? "" : " (offer basic value)"),
              Kit.money(t.base),
            ],
          ]
            .concat(
              Kit.bankOnly()
                ? []
                : [["Management discount, no GST", Kit.money(t.md)]],
            )
            .concat([
              ["Bank amount before GST", Kit.money(t.bankBase)],
              ["GST 18% on the bank amount", Kit.money(t.tax)],
              ["In bank, with GST", Kit.money(t.bank)],
            ])
            .concat(
              Kit.bankOnly()
                ? []
                : [["Free accessories", Kit.money(t.freight)]],
            )
            .concat([
              ["Total payable by client", Kit.money(t.total)],
              ["Payment plan", L.PLANS[c.payment.plan].label],
            ]),
        },
    !t.total
      ? null
      : {
          heading: "Money",
          rows: L.ledger(c)
            .map(function (s) {
              return [
                s.name + " " + s.percent + "%",
                Kit.money(s.amount) +
                  " - paid " +
                  Kit.money(s.paid) +
                  ", left " +
                  Kit.money(s.due),
              ];
            })
            .concat([
              [
                "Received so far",
                Kit.money(L.collected(c)) +
                  " (" +
                  Math.round((L.collected(c) / t.total) * 100) +
                  "% of the order)",
              ],
              ["Booking amount left", Kit.money(L.bookingLeft(c))],
              ["Rest of booking amount by", day(c.payment.expectedBy)],
            ])
            .concat(
              c.payment.receipts.map(function (r) {
                return [
                  "Payment " + day(r.date),
                  Kit.money(r.amount) +
                    " - " +
                    (r.mode || "mode not set") +
                    " - " +
                    (r.status === "Requested" ? "with Accounts" : r.status) +
                    (r.reason ? " (" + r.reason + ")" : ""),
                ];
              }),
            ),
        },
    !d
      ? null
      : {
          heading: "Timeline",
          rows: [
            [
              "Timeline",
              c.timeline.type +
                ", " +
                c.timeline.productionDays +
                " production days",
            ],
            ["Booked on", day(c.bookedAt)],
            ["OCF date", day(c.ocfAt)],
            ["Drawing signoff", day(d.signoff)],
            ["PDI", day(d.pdi)],
            ["Dispatch", day(d.dispatch)],
            ["Pooja / handover", day(d.handover)],
          ].concat(
            (c.timelineChanges || []).map(function (x) {
              return [
                "Changed by " + x.by + " on " + day(x.at),
                "Handover " +
                  day(x.before.handover) +
                  " to " +
                  day(x.after.handover),
              ];
            }),
          ),
        },
    {
      heading: "Approvals",
      rows: [
        ["Payment plan", c.approvals.plan],
        ["Timeline (Design)", c.approvals.timeline],
        ["Booking (Accounts)", c.approvals.booking],
        [
          "Site measurement",
          c.measurement
            ? "Requested " +
              day(c.measurement.requestedAt) +
              (c.measurement.date ? ", visit " + day(c.measurement.date) : "")
            : "Not requested",
        ],
      ],
    },
    {
      heading: "Design",
      rows: [
        ["Design presentation", b.presentation],
        ["Design theme", b.theme],
        ["Kitchen type", b.kitchenType.join(", ")],
        ["Room / area", b.room],
        ["Ceiling height (mm)", b.ceilingHeight],
        ["Kitchen height (mm)", b.kitchenHeight],
        ["Island", b.island],
        ["Gas", b.gas],
        ["Vastu", b.vastu],
        ["Design required on", day(b.requiredOn)],
        ["Notes", b.notes],
      ]
        .filter(function (r) {
          return r[1];
        })
        .concat(
          c.design.proposals.map(function (p) {
            return [
              "Proposal V" + p.v,
              Kit.money(p.amount) +
                " - from Design " +
                day(p.receivedAt) +
                " - " +
                p.status,
            ];
          }),
        )
        .concat(
          c.design.revisions.map(function (r) {
            return [
              "Revision of V" + r.ofVersion,
              r.reason +
                (r.notes ? " - " + r.notes : "") +
                " (" +
                day(r.at) +
                ")",
            ];
          }),
        ),
    },
    {
      heading: "Documents",
      rows: [
        ["Signed quotation", c.docs.quotation],
        ["Signed drawing", c.docs.drawing],
        ["Screenshot", c.docs.screenshot],
        ["Recorded message", c.docs.recording],
        ["DRF and drawings", c.docs.drf],
        ["House layout", c.docs.layout],
      ].filter(function (r) {
        return r[1];
      }),
    },
    {
      heading: "Calls and meetings",
      rows: c.contacts.slice(0, 40).map(function (e) {
        return [
          Kit.dayTime(e.at),
          [
            e.type,
            Kit.outcome(e.outcome),
            e.note,
            e.next ? "next " + Kit.when(e.next) : "",
          ]
            .filter(Boolean)
            .join(" - "),
        ];
      }),
    },
  ];
}
export function clientPdf(c) {
  Kit.pdf(
    c.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") +
      "-" +
      c.pid +
      ".pdf",
    c.name,
    "Project " + c.pid + " · Customer " + c.cid + " · " + People.owner(c),
    clientReport(c),
  );
}

export function weeklyReport(ctx) {
  const to = new Date(),
    from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  const inWeek = function (iso) {
    if (!iso) return false;
    const t = new Date(iso);
    return t >= from && t <= to;
  };
  const all = ctx.all.filter(function (c) {
    return c.stage !== "bin";
  });
  const sum = function (list, f) {
    return list.reduce(function (t, x) {
      return t + (Number(f(x)) || 0);
    }, 0);
  };
  const names = function (list, extra) {
    return list.length
      ? list
          .map(function (c) {
            return c.name + (extra ? " (" + extra(c) + ")" : "");
          })
          .join(", ")
      : "None";
  };
  const value = function (c) {
    return L.totals(c).total;
  };

  const fresh = all.filter(function (c) {
    return inWeek(c.receivedAt);
  });
  const calls = [];
  all.forEach(function (c) {
    (c.contacts || []).forEach(function (e) {
      if (inWeek(e.at)) calls.push({ c: c, e: e });
    });
  });
  const spoke = calls.filter(function (x) {
    return /spoke/i.test(x.e.outcome || "");
  });
  const accepted = all.filter(function (c) {
    return inWeek(c.acceptedAt);
  });
  const proposals = [];
  all.forEach(function (c) {
    (c.design.proposals || []).forEach(function (p) {
      if (inWeek(p.receivedAt)) proposals.push({ c: c, p: p });
    });
  });
  const booked = all.filter(function (c) {
    return inWeek(c.bookedAt);
  });
  const lost = all.filter(function (c) {
    return c.stage === "lost" && inWeek(c.lostAt);
  });
  const money = [];
  all.forEach(function (c) {
    c.payment.receipts.forEach(function (r) {
      if (r.status === "Confirmed" && inWeek(r.decidedAt || r.date))
        money.push({ c: c, r: r });
    });
  });
  const owing = all.filter(function (c) {
    return c.stage === "booked" && L.bookingLeft(c) > 0;
  });
  const uncalled = all.filter(function (c) {
    return c.stage === "qualified" && !c.spokeAt;
  });
  const stage = function (id) {
    return all.filter(function (c) {
      return c.stage === id;
    });
  };
  const who = People.list[0].name;
  const span = Kit.day(from.toISOString()) + " to " + Kit.day(to.toISOString());

  Kit.pdf(
    "Weekly-sales-report-" +
      who.replace(/[^A-Za-z0-9]+/g, "-") +
      "-" +
      to.toISOString().slice(0, 10) +
      ".pdf",
    "Weekly sales report",
    who + " · " + span + " · amounts in lakhs",
    [
      {
        heading: "This week in short",
        rows: [
          ["New leads", String(fresh.length)],
          [
            "Calls and contacts saved",
            calls.length + " · spoke to client " + spoke.length,
          ],
          ["Accepted into design", String(accepted.length)],
          ["Proposals received", String(proposals.length)],
          ["Booked", booked.length + " · " + Kit.short(sum(booked, value))],
          [
            "Money confirmed by Accounts",
            Kit.short(
              sum(money, function (x) {
                return x.r.amount;
              }),
            ) +
              " · " +
              money.length +
              " payment(s)",
          ],
          ["Leads lost", String(lost.length)],
        ],
      },
      {
        heading: "Where everything stands today",
        rows: [
          [
            "Qualified leads",
            stage("qualified").length + " · not called yet " + uncalled.length,
          ],
          ["In design", String(stage("design").length)],
          [
            "Booked, collecting",
            stage("booked").length +
              " · order value " +
              Kit.short(sum(stage("booked"), value)),
          ],
          [
            "Post-design",
            stage("post").length +
              " · order value " +
              Kit.short(sum(stage("post"), value)),
          ],
          [
            "Booking amount still to collect",
            Kit.short(sum(owing, L.bookingLeft)) +
              " from " +
              owing.length +
              " client(s)",
          ],
        ],
      },
      {
        heading: "New leads this week",
        rows: fresh.map(function (c) {
          return [
            c.name,
            (c.city || "") +
              " · " +
              (c.source || "Source not set") +
              " · " +
              (c.spokeAt ? "spoken to" : "not called yet"),
          ];
        }),
      },
      {
        heading: "Booked this week",
        rows: booked.map(function (c) {
          return [
            c.name,
            Kit.short(value(c)) +
              " · " +
              c.payment.plan +
              " plan · collected " +
              Kit.short(L.collected(c)),
          ];
        }),
      },
      {
        heading: "Money confirmed this week",
        rows: money.map(function (x) {
          return [
            x.c.name,
            Kit.short(x.r.amount) +
              " · " +
              Kit.day(x.r.decidedAt || x.r.date) +
              (x.r.mode ? " · " + x.r.mode : ""),
          ];
        }),
      },
      {
        heading: "Proposals received this week",
        rows: proposals.map(function (x) {
          return [x.c.name, "V" + x.p.v + " · " + Kit.short(x.p.amount)];
        }),
      },
      {
        heading: "Calls this week",
        rows: calls.map(function (x) {
          return [
            x.c.name,
            Kit.dayTime(x.e.at) +
              " · " +
              Kit.outcome(x.e.outcome) +
              (x.e.note ? " · " + x.e.note : ""),
          ];
        }),
      },
      {
        heading: "Lost this week",
        rows: lost.map(function (c) {
          return [c.name, c.lostReason || "No reason given"];
        }),
      },
      {
        heading: "Still to collect",
        rows: owing.map(function (c) {
          return [
            c.name,
            Kit.short(L.bookingLeft(c)) +
              " left of " +
              Kit.short(L.bookingDue(c)) +
              (c.payment.expectedBy
                ? " · expected " + Kit.day(c.payment.expectedBy)
                : " · no date set"),
          ];
        }),
      },
      {
        heading: "Not called yet",
        rows: uncalled.map(function (c) {
          return [
            c.name,
            "received " + Kit.day(c.receivedAt) + " · " + (c.city || ""),
          ];
        }),
      },
    ],
  );
}
