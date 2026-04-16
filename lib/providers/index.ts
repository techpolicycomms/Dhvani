/**
 * Provider factory.
 *
 * Route and component code should call getAIProvider() here rather
 * than import Azure/Gemini/etc. directly. Adding a new provider is
 * now: write a class that implements AIProvider, add a case below,
 * set AI_PROVIDER in env.
 *
 * Future factories (getCalendarProvider, getStorageProvider, …) live
 * in this same module so there is a single import path for all
 * horizontal integrations.
 */

import { getConfig } from "@/lib/config";
import type { AIProvider } from "./ai";
import { AzureOpenAIProvider } from "./azure-openai";

export type { AIProvider } from "./ai";
export type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  ChatUsage,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from "./ai";

export function getAIProvider(): AIProvider {
  const { provider } = getConfig().ai;
  switch (provider) {
    case "azure-openai":
      return new AzureOpenAIProvider();
    // Future:
    //   case "google-gemini":  return new GeminiProvider();
    //   case "anthropic":      return new AnthropicProvider();
    //   case "local-whisper":  return new LocalWhisperProvider();
    default:
      return new AzureOpenAIProvider();
  }
}
