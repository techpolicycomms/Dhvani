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
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2025-03-01-preview",
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
