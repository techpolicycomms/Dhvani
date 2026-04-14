import OpenAI from "openai";

/**
 * Create an OpenAI client with the given API key. Falls back to the
 * server-side OPENAI_API_KEY env var. This factory ensures the client is
 * never instantiated at module scope, keeping the key out of any bundle.
 */
export function createOpenAIClient(apiKey?: string | null): OpenAI {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "Missing OpenAI API key. Set OPENAI_API_KEY in .env.local or provide one in Settings."
    );
  }
  return new OpenAI({ apiKey: key });
}
