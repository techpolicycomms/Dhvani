/**
 * Map raw Azure / network errors to user-actionable copy.
 * D11 in the UX addendum — never show a stack trace in the main UI.
 *
 * Returns:
 *   - title:  one-line plain-language summary
 *   - hint:   what to try (or null when nothing to do but wait)
 *   - link:   optional URL the user can click ("Open Azure portal")
 *   - severity: drives toast color + persistence
 */

export type SmartError = {
  title: string;
  hint: string | null;
  link?: { label: string; href: string };
  severity: "info" | "warning" | "error";
};

const AZURE_PORTAL = "https://portal.azure.com";
const AZURE_STATUS = "https://status.azure.com";

export function interpretError(raw: string | null | undefined): SmartError {
  const msg = (raw ?? "").trim();
  const lower = msg.toLowerCase();

  // HTTP-status patterns surface from upstream as "HTTP 401" / "HTTP 429" etc.
  if (/\b401\b/.test(msg) || lower.includes("unauthorized") || lower.includes("invalid api key")) {
    return {
      title: "Azure rejected your key.",
      hint: "The key may have been rotated or entered incorrectly. Check the Azure portal and update the deployment.",
      link: { label: "Open Azure portal", href: AZURE_PORTAL },
      severity: "error",
    };
  }
  if (/\b429\b/.test(msg) || lower.includes("rate limit") || lower.includes("too many requests")) {
    return {
      title: "Azure is rate-limiting requests.",
      hint: "Your plan may have hit its quota. We'll retry automatically in 60 seconds.",
      link: { label: "Check Azure usage", href: AZURE_PORTAL },
      severity: "warning",
    };
  }
  if (/\b403\b/.test(msg) || lower.includes("forbidden")) {
    return {
      title: "Azure denied access to that resource.",
      hint: "Verify the deployment region and that your key has access to the model deployment.",
      link: { label: "Open Azure portal", href: AZURE_PORTAL },
      severity: "error",
    };
  }
  if (/\b404\b/.test(msg) || lower.includes("not found") || lower.includes("deployment not found")) {
    return {
      title: "Azure deployment not found.",
      hint: "The deployment name in server config doesn't match what's in your Azure tenant. Ask the admin to recheck.",
      severity: "error",
    };
  }
  if (/\b50[0234]\b/.test(msg) || lower.includes("service unavailable") || lower.includes("internal server error")) {
    return {
      title: "Azure Speech is temporarily unavailable.",
      hint: "We'll keep trying. If this persists for more than a few minutes, check the Azure status page.",
      link: { label: "Azure status", href: AZURE_STATUS },
      severity: "warning",
    };
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout") || lower.includes("offline")) {
    return {
      title: "Your connection is slow.",
      hint: "We'll keep retrying silently. Recording continues; the transcript will catch up when the network returns.",
      severity: "info",
    };
  }
  if (lower.includes("session expired") || lower.includes("sign in")) {
    return {
      title: "Your session expired.",
      hint: "Sign in again to keep transcribing.",
      severity: "warning",
    };
  }
  if (lower.includes("corrupted") || lower.includes("unsupported") || lower.includes("invalid file")) {
    return {
      title: "An audio chunk was unreadable.",
      hint: "Skipped this fragment and continuing — usually a transient browser hiccup.",
      severity: "info",
    };
  }
  // Fallback — keep the raw message but soften its framing.
  return {
    title: msg || "Something went wrong with transcription.",
    hint: "Try again, or check the network and Azure status.",
    severity: "error",
  };
}
