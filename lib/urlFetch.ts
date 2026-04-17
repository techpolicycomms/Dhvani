/**
 * Safe remote-URL helper used by /api/url-transcribe.
 *
 * Two hazards to defend against:
 *   1. SSRF — a user-supplied URL must never reach internal services
 *      (localhost, RFC1918 ranges, link-local, metadata IPs). We enforce
 *      HTTPS + hostname checks before any fetch.
 *   2. Unbounded downloads — an attacker could point at a 10 GB file and
 *      exhaust disk or memory. We stream into a bounded buffer and fail
 *      fast once the limit is exceeded.
 *
 * Not handled here (deliberately): DNS rebinding. Production behind a
 * proxy / egress firewall should additionally block RFC1918 at the
 * network layer so a domain that resolves to 10.0.0.1 mid-request is
 * stopped regardless of this code path.
 */

const MAX_BYTES = 25 * 1024 * 1024; // Azure OpenAI audio limit

export type UrlKind = "youtube" | "direct" | "gdrive" | "vimeo" | "unknown";

export function classifyUrl(url: string): UrlKind {
  const u = url.toLowerCase();
  if (u.includes("youtube.com/watch") || u.includes("youtu.be/")) return "youtube";
  if (u.includes("drive.google.com")) return "gdrive";
  if (u.includes("vimeo.com")) return "vimeo";
  if (/\.(mp3|mp4|wav|webm|ogg|m4a|aac|flac)(\?|#|$)/.test(u)) return "direct";
  return "unknown";
}

export function validateUrl(url: string): { ok: true } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Only https:// URLs are allowed." };
  }
  const host = parsed.hostname.toLowerCase();
  // Block obvious SSRF targets. DNS-based exfiltration is out of scope
  // for v1 — rely on the platform egress firewall for that.
  const blocked =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host); // AWS/Azure metadata range
  if (blocked) {
    return { ok: false, reason: "URL points at a private or internal host." };
  }
  return { ok: true };
}

/**
 * Fetch the URL and return its bytes, capped at MAX_BYTES. Rejects with
 * a machine-readable code/message on any failure. The content-type is
 * checked to make sure we're actually downloading audio or video —
 * HTML or a generic octet-stream is refused up-front.
 */
export async function fetchRemoteMedia(
  url: string,
  signal?: AbortSignal
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  filename: string;
}> {
  const res = await fetch(url, { redirect: "follow", signal });
  if (!res.ok) {
    throw new Error(`Upstream returned ${res.status}.`);
  }
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (
    !contentType.startsWith("audio/") &&
    !contentType.startsWith("video/")
  ) {
    throw new Error(
      `URL did not serve audio or video (content-type: ${contentType || "unknown"}).`
    );
  }
  // Stream into a growing Uint8Array, fail fast past the cap.
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response has no readable body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      reader.cancel();
      throw new Error(
        `File is larger than 25 MB. Split it locally and upload via /upload instead.`
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  const extFromUrl = (url.match(/\.(mp3|mp4|wav|webm|ogg|m4a|aac|flac)/i)?.[1] || "").toLowerCase();
  const extFromType = contentType.split("/")[1]?.split(";")[0] || "audio";
  const ext = extFromUrl || extFromType;
  const filename = `url-${Date.now()}.${ext}`;
  return { bytes, contentType, filename };
}

export const MAX_REMOTE_BYTES = MAX_BYTES;
