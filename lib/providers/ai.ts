/**
 * AI provider contract.
 *
 * Every AI call in Dhvani (transcription + chat) goes through this
 * interface. Swapping providers (Azure OpenAI → Google Gemini → local
 * Whisper) means adding one new implementation and flipping
 * AI_PROVIDER; API routes and components stay untouched.
 *
 * Shape notes:
 *   - `TranscriptionResult` mirrors what /api/transcribe currently
 *     returns so existing clients keep working.
 *   - `ChatResult.usage` is optional because not every provider
 *     exposes token counts (and we shouldn't fail a summary over it).
 */

export type TranscriptionSegment = {
  speaker: string;
  text: string;
  start: number;
  end: number;
};

export type TranscriptionResult = {
  text: string;
  segments: TranscriptionSegment[];
  language: string | null;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
  /** AbortSignal forwarded to the underlying fetch. */
  signal?: AbortSignal;
};

export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type ChatResult = {
  text: string;
  usage?: ChatUsage;
};

export type TranscribeOptions = {
  /** ISO 639-1 hint. Undefined = auto-detect. */
  language?: string;
};

export interface AIProvider {
  readonly name: string;
  transcribe(
    file: File,
    options?: TranscribeOptions
  ): Promise<TranscriptionResult>;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
}
