import { AzureOpenAI } from "openai";

/**
 * Create an Azure OpenAI client using the server-side env vars. Dhvani is
 * deployed inside Azure so transcription stays on Microsoft's network —
 * there are no outbound calls to api.openai.com.
 *
 * Required env vars:
 *   - AZURE_OPENAI_API_KEY        — from Azure AI Foundry → Deployments → whisper → Key
 *   - AZURE_OPENAI_ENDPOINT       — e.g. https://my-resource.openai.azure.com/
 *   - AZURE_OPENAI_WHISPER_DEPLOYMENT — the deployment name (defaults to "whisper-1")
 *
 * The factory is deliberately not memoised; construction is cheap and this
 * keeps the key off of the module-level scope (and out of any bundle).
 */
export function createOpenAIClient(): AzureOpenAI {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!apiKey || !endpoint) {
    throw new Error(
      "Missing Azure OpenAI config. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in .env.local."
    );
  }
  return new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion: "2024-06-01",
  });
}

/**
 * Deployment name for the transcription model on the Azure OpenAI
 * resource. Defaults to `gpt-4o-transcribe-diarize` — the same family as
 * Whisper but with speaker diarization baked in. Override with
 * AZURE_OPENAI_WHISPER_DEPLOYMENT to point at a differently-named
 * deployment (e.g. "whisper-1" for the legacy model).
 */
export function whisperDeployment(): string {
  return (
    process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT || "gpt-4o-transcribe-diarize"
  );
}

/**
 * Deployment name for the chat/completions model used for summarization
 * and "Ask Dhvani" features. Defaults to `gpt-4o` — override with
 * AZURE_OPENAI_CHAT_DEPLOYMENT if your resource has a differently-named
 * deployment (e.g. "gpt-4o-mini", "gpt-35-turbo").
 *
 * Returns null if no chat deployment is configured AND the default isn't
 * set — callers should degrade gracefully (hide the "Generate Summary"
 * button, etc.).
 */
export function chatDeployment(): string {
  return process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || "gpt-4o";
}

/**
 * Chat features (summarize, Ask Dhvani, follow-up email) may live on a
 * different Azure OpenAI resource than transcription — e.g. the SWC
 * resource has the audio/diarize deployment while chat models are on
 * EUW. Any of AZURE_OPENAI_CHAT_{API_KEY,ENDPOINT,API_VERSION} overrides
 * the corresponding transcription-side value; unset fields fall back to
 * the shared AZURE_OPENAI_* config.
 */
export function createChatOpenAIClient(): AzureOpenAI {
  const apiKey =
    process.env.AZURE_OPENAI_CHAT_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  const endpoint =
    process.env.AZURE_OPENAI_CHAT_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT;
  const apiVersion =
    process.env.AZURE_OPENAI_CHAT_API_VERSION ||
    process.env.AZURE_OPENAI_API_VERSION ||
    "2024-06-01";
  if (!apiKey || !endpoint) {
    throw new Error(
      "Missing Azure OpenAI chat config. Set AZURE_OPENAI_CHAT_API_KEY and AZURE_OPENAI_CHAT_ENDPOINT (or the shared AZURE_OPENAI_* pair) in .env.local."
    );
  }
  return new AzureOpenAI({ apiKey, endpoint, apiVersion });
}
