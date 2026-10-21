import { afterEach, expect, it, vi } from "vitest";
import { uploadAttachment, uploadTemporary } from "../../../shared/uploads";

afterEach(() => vi.unstubAllGlobals());

it("sends metadata through CRM and file bytes through the scoped storage URL", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: "https://storage.example.invalid/scoped",
          method: "PUT",
          name: "layout.pdf",
        }),
      ),
    )
    .mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", request);
  const file = new File([new Uint8Array(5 * 1024 * 1024)], "layout.pdf");
  expect(await uploadAttachment("client-1", file)).toBe("layout.pdf");
  expect(request.mock.calls[0][0]).toBe("/api/uploads/sign/client-1");
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
    name: "layout.pdf",
    size: file.size,
  });
  expect(request.mock.calls[1][1]).toMatchObject({
    method: "PUT",
    body: file,
    credentials: "omit",
  });
});

it("does not return a temporary object identifier after a failed byte upload", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "/api/upload-temp/synthetic",
            method: "PUT",
            name: "synthetic",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 503 })),
  );
  await expect(uploadTemporary(new Blob(["synthetic"]))).rejects.toThrow(
    "upload failed",
  );
});
