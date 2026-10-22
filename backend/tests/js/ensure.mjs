// Runs the real shared/rules.js L.ensure (and L.flow) on clients read from stdin; used by test_permissions.py.
import { readFileSync } from "node:fs";
import vm from "node:vm";
const input = JSON.parse(readFileSync(0, "utf8"));
const context = { console, Date, window: {} };
context.Kit = { now: () => "2026-10-22T12:00:00.000Z", store: {}, news() {} };
context.window.Kit = context.Kit;
vm.createContext(context);
vm.runInContext(readFileSync(new URL("../../../shared/rules.js", import.meta.url), "utf8"), context);
const L = context.window.SalesLogic;
process.stdout.write(
  JSON.stringify(
    input.map((c) => {
      const plain = L.ensure(structuredClone(c));
      const flowed = L.ensure(structuredClone(c));
      L.flow(flowed);
      return { plain, flowed };
    }),
  ),
);
