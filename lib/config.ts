/**
 * Centralised Dhvani runtime configuration.
 *
 * Every env-driven knob is read here so feature toggles and provider
 * swaps can happen without touching route or component code. The
 * shape is deliberately flat/JSON-friendly — it can be serialised for
 * a future /api/config endpoint that powers an admin dashboard.
 *
 * All values are derived from env vars at call time (not memoised) so
 * Next.js dev-server env reloads take effect without a process restart.
 */

export type DhvaniConfig = {
  ai: {
    provider: string;
    transcriptionModel: string;
    chatModel: string;
  };
  calendar: { provider: string };
  storage: { provider: string; basePath: string };
  auth: { provider: string };
  notifications: { provider: string; webhookUrl?: string };
  features: {
    summaryEnabled: boolean;
    askAiEnabled: boolean;
    calendarEnabled: boolean;
    uploadEnabled: boolean;
    sharingEnabled: boolean;
  };
};

function flagOn(envVar: string): boolean {
  // Default-on flag — disabled only when explicitly set to "false".
  return process.env[envVar] !== "false";
}

export function getConfig(): DhvaniConfig {
  return {
    ai: {
      provider: process.env.AI_PROVIDER || "azure-openai",
      transcriptionModel:
        process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT ||
        "gpt-4o-transcribe-diarize",
      chatModel: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-4o",
    },
    calendar: { provider: process.env.CALENDAR_PROVIDER || "microsoft" },
    storage: {
      provider: process.env.STORAGE_PROVIDER || "filesystem",
      basePath: process.env.DHVANI_DATA_DIR || "./data",
    },
    auth: { provider: process.env.AUTH_PROVIDER || "microsoft-entra" },
    notifications: {
      provider: process.env.NOTIFICATION_PROVIDER || "browser",
      webhookUrl: process.env.NOTIFICATION_WEBHOOK_URL,
    },
    features: {
      summaryEnabled: flagOn("FEATURE_SUMMARY"),
      askAiEnabled: flagOn("FEATURE_ASK_AI"),
      calendarEnabled: flagOn("FEATURE_CALENDAR"),
      uploadEnabled: flagOn("FEATURE_UPLOAD"),
      sharingEnabled: flagOn("FEATURE_SHARING"),
    },
  };
}
