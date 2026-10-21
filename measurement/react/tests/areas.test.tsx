// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import Areas from "../src/Areas";
import { adapt } from "../src/model";
// @ts-expect-error existing deterministic selector service
import selectors from "../../common/source-model.js";
it("renders escaped React map popups, opens the request and cleans up the map", async () => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.Measurements = selectors;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"type":"FeatureCollection","features":[]}'),
      ),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    open = vi.fn();
  const record = adapt({
    id: "map-test",
    client: "<script>unsafe</script>",
    stage: "PDI",
    coordinates: [28.6, 77.2],
  });
  try {
    await act(async () =>
      root.render(<Areas records={[record]} onOpen={open} focusId="" />),
    );
    const marker = host.querySelector<HTMLElement>(".leaflet-marker-icon")!;
    expect(marker).not.toBeNull();
    await act(async () => marker.click());
    const popup = host.querySelector(".leaflet-popup-content")!;
    expect(popup.textContent).toContain("<script>unsafe</script>");
    expect(popup.querySelector("script")).toBeNull();
    await act(async () =>
      popup.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(open).toHaveBeenCalledWith(record);
    await act(async () => root.unmount());
    expect(host.querySelector(".leaflet-container")).toBeNull();
  } finally {
    host.remove();
    vi.unstubAllGlobals();
  }
});
