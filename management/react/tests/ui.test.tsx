// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { install, fixture, client } from "./setup";
import { Overview, PeoplePage, ClientsPage } from "../src/Pages";
import { Analysis } from "../src/Analysis";
import { ClientDetail, PersonDetail } from "../src/Details";
import { liveClients } from "../src/model";
let root: Root, host: HTMLDivElement;
beforeAll(() => {
  install();
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
});
async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(node));
}
it("overview opens native person and client details", async () => {
  const live = liveClients(fixture()),
    show = vi.fn();
  await render(<Overview shown={live} live={live} who="" show={show} />);
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".person")!.click(),
  );
  expect(show).toHaveBeenCalledWith({ kind: "person", id: "tavneet" });
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".management-item")!.click(),
  );
  expect(show.mock.lastCall?.[0].kind).toBe("client");
});
it("renders all eight report cards and date selector", async () => {
  const set = vi.fn();
  await render(<Analysis all={fixture()} range="all" setRange={set} />);
  expect(host.querySelectorAll(".ana-grid>section")).toHaveLength(8);
  const select = host.querySelector("select")!;
  await act(async () => {
    select.value = "lastMonth";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(set).toHaveBeenCalledWith("lastMonth");
  expect(host.querySelectorAll("[role=table][aria-label]").length).toBe(7);
});
it("shows empty analysis and source states without missing values", async () => {
  await render(<Analysis all={[]} range="all" setRange={() => {}} />);
  expect(host.textContent).toContain("No data yet");
  expect(host.textContent).toContain("No revisions in this period");
  expect(host.textContent).not.toMatch(/undefined|NaN/);
});
it("client filters are labelled and dispatch selected values", async () => {
  const stage = vi.fn(),
    only = vi.fn();
  await render(
    <ClientsPage
      shown={[]}
      stage=""
      only=""
      setStage={stage}
      setOnly={only}
      show={() => {}}
    />,
  );
  expect(host.textContent).toContain("No clients match");
  const inputs = host.querySelectorAll("select");
  await act(async () => {
    inputs[0].value = "booked";
    inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    inputs[1].value = "yes";
    inputs[1].dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(stage).toHaveBeenCalledWith("booked");
  expect(only).toHaveBeenCalledWith("yes");
  expect(inputs[0].getAttribute("aria-label")).toBe("Stage");
});
it("people comparison includes every team member even with no clients", async () => {
  await render(<PeoplePage live={[]} show={() => {}} />);
  expect(host.querySelectorAll("button.row")).toHaveLength(
    window.People.list.length,
  );
  expect(host.textContent).toContain("On track");
  expect(host.textContent).toContain("No clients");
});
it("client detail contains read-only money, dates, flags and calls", async () => {
  const c = fixture()[3],
    close = vi.fn();
  await render(<ClientDetail c={c} close={close} />);
  expect(host.querySelector("dialog")?.getAttribute("aria-label")).toBe(c.name);
  expect(host.textContent).toContain("Still to collect");
  expect(host.querySelectorAll("input,textarea,select")).toHaveLength(0);
  expect(host.querySelectorAll("button")).toHaveLength(1);
  await act(async () =>
    host
      .querySelector("dialog")!
      .dispatchEvent(new Event("cancel", { cancelable: true })),
  );
  expect(close).toHaveBeenCalledOnce();
});
it("person detail drilldown opens the selected client", async () => {
  const show = vi.fn();
  await render(
    <PersonDetail
      p={window.People.list[0]}
      live={liveClients(fixture())}
      show={show}
      close={() => {}}
    />,
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".mini")!.click(),
  );
  expect(show.mock.lastCall?.[0].kind).toBe("client");
});
it("dialog restores keyboard focus on close", async () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  await render(<ClientDetail c={client()} close={() => {}} />);
  await act(async () => root.render(<div />));
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
