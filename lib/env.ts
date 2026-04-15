/**
 * Server-side env-var validator.
 *
 * Next.js doesn't have a single "startup" hook on serverless/Edge, so we
 * lazy-validate on the first call from each route group. Result is
 * memoised — the actual checks only run once per cold start.
 *
 * Throwing here turns into a clear 500 with the variable name, instead
 * of the cryptic "Cannot read property 'x' of undefined" we'd get
 * downstream.
 */

type Group = "auth" | "openai";

const required: Record<Group, string[]> = {
  auth: [
    "NEXTAUTH_SECRET",
    "AZURE_AD_CLIENT_ID",
    "AZURE_AD_CLIENT_SECRET",
    "AZURE_AD_TENANT_ID",
  ],
  openai: [
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_WHISPER_DEPLOYMENT",
  ],
};

const checked = new Set<Group>();

export function requireEnv(group: Group): void {
  if (checked.has(group)) return;
  const missing = required[group].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars for "${group}": ${missing.join(", ")}. ` +
        `See .env.local.example.`
    );
  }
  checked.add(group);
}
