import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Stats, Details, RequestRows } from "../src/components";
import { adapt } from "../src/model";
const record = adapt({
  id: "test",
  client: "<script>unsafe</script>",
  stage: "PDI",
  status: "Completed",
});
describe("Measurement React rendering", () => {
  it("escapes CRM text in request rows", () => {
    const html = renderToStaticMarkup(
      <RequestRows records={[record]} onOpen={() => {}} />,
    );
    expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("renders all five count actions and explicit empty states", () => {
    const html = renderToStaticMarkup(
      <Stats records={[record]} onStatus={() => {}} />,
    );
    expect((html.match(/<button/g) || []).length).toBe(5);
    expect(html).toContain("Done");
    expect(
      renderToStaticMarkup(<RequestRows records={[]} onOpen={() => {}} />),
    ).toContain("No requests yet.");
  });
  it("preserves visit, site, source, and read-only guidance in details", () => {
    const html = renderToStaticMarkup(
      <Details record={record} onClose={() => {}} onMap={() => {}} />,
    );
    for (const text of [
      "Visit",
      "Site",
      "Source",
      "CRM order ID",
      "read-only Zoho",
      "Close dialog",
    ])
      expect(html).toContain(text);
  });
});
