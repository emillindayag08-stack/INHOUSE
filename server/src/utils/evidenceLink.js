// Evidence hosted elsewhere is recorded as a link. Shared by the evidence-link
// route and filing, which takes an anonymous complaint's links with it.

// Each party's allowance of links on a case.
export const EVIDENCE_LINK_MAX = 3;

// { externalUrl, fileName } → { url, label, hostname } or { error }.
export function parseEvidenceLink({ externalUrl, fileName } = {}) {
  const rawUrl = String(externalUrl || "").trim();
  if (!rawUrl) return { error: "A link is required" };
  if (rawUrl.length > 2000) return { error: "That link is too long" };
  // Only http(s): a javascript:/data: URL here would be rendered as a
  // clickable link for CODI staff to open.
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: "Enter a valid link, including https://" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Links must start with http:// or https://" };
  }
  // Label shown in the evidence list; defaults to the host so a bare link
  // still reads as something ("drive.google.com") rather than blank.
  const label =
    String(fileName || "")
      .replace(/[\\/\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 200) || parsed.hostname;
  return { url: parsed.toString(), label, hostname: parsed.hostname };
}
