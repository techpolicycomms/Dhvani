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

/** Deployment name for the Whisper model on the Azure OpenAI resource. */
export function whisperDeployment(): string {
  return process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT || "whisper-1";
}
