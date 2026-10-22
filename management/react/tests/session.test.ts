// @vitest-environment jsdom
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { install } from "./setup";
import { readStore } from "../src/data";
import { resetSessionEnded } from "../../../shared/session";
beforeAll(install);
afterEach(() => vi.unstubAllGlobals());
it("an ended session goes to sign-in and comes back to Management after", async () => {
  resetSessionEnded();
  const assign = vi.fn();
  vi.stubGlobal("location", {
    ...location,
    assign,
    pathname: "/management/",
    search: "",
    hash: "#overview",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  await expect(readStore()).rejects.toThrow("Session ended — sign in again.");
  expect(assign).toHaveBeenCalledWith(
    "/login?reason=ended&next=%2Fmanagement%2F%23overview",
  );
});
