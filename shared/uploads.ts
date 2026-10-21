/** Browser sends bytes directly to private Storage using a scoped upload token. */
export async function uploadTemporary(file: Blob): Promise<string> {
  const response = await fetch("/api/uploads/temporary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size: file.size }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw Error("The file upload could not be authorized. Please retry.");
  const grant = await response.json();
  if (
    typeof grant.url !== "string" ||
    typeof grant.name !== "string" ||
    grant.method !== "PUT"
  )
    throw Error("The upload was not confirmed. Please retry.");
  const result = await fetch(grant.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
    credentials: grant.url.startsWith("/") ? "same-origin" : "omit",
    signal: AbortSignal.timeout(120000),
  });
  if (!result.ok) throw Error("The file upload failed. Please retry.");
  return grant.name;
}

export async function uploadAttachment(
  owner: string,
  file: File,
): Promise<string> {
  if (file.size > 25 * 1024 * 1024)
    throw Error("This file is larger than 25 MB. Choose a smaller file.");
  const signed = await fetch("/api/uploads/sign/" + encodeURIComponent(owner), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size }),
    signal: AbortSignal.timeout(30000),
  });
  if (!signed.ok)
    throw Error(
      "The file could not be uploaded. Your form is retained; please retry.",
    );
  const grant = await signed.json();
  if (
    typeof grant.url !== "string" ||
    typeof grant.name !== "string" ||
    grant.method !== "PUT"
  )
    throw Error("The upload was not confirmed. Please retry.");
  const result = await fetch(grant.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
    credentials: grant.url.startsWith("/") ? "same-origin" : "omit",
    signal: AbortSignal.timeout(120000),
  });
  if (!result.ok)
    throw Error(
      "The file could not be uploaded. Your form is retained; please retry.",
    );
  return grant.name;
}
