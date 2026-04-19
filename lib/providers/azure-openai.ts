/**
 * Azure OpenAI implementation of the AI provider contract.
 *
 * This wraps the existing `createOpenAIClient` + `createChatOpenAIClient`
 * helpers in `lib/openai.ts` so the concrete call-site logic lives in
 * one place. The wrapper preserves today's behavior exactly:
 *   - transcribe: verbose_json → fallback to json on deployments that
 *     reject verbose_json; normalises segments/text shape.
 *   - chat: forwards temperature/max_tokens/signal to the SDK.
 */

import {
  createOpenAIClient,
  createChatOpenAIClient,
  whisperDeployment,
  chatDeployment,
} from "@/lib/openai";
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
  TranscribeOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from "./ai";

type RawTranscriptionResult = {
  text?: string;
  language?: string;
  segments?: Array<{
    id?: number;
    start?: number;
    end?: number;
    text?: string;
    speaker?: string;
  }>;
};

function isIncompatibleResponseFormatError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const msg = (e.message || "").toLowerCase();
  return (
    e.status === 400 &&
    msg.includes("response_format") &&
    (msg.includes("not compatible") || msg.includes("use 'json' or 'text'"))
  );
}

/**
 * gpt-4o-transcribe-diarize rejects the `prompt` parameter with
 * "Prompt is not supported for diarization models". Other deployments
 * (plain gpt-4o-transcribe, Whisper) accept it. Detect and retry
 * without prompt so a deployment choice doesn't silently break every
 * chunk when ITU vocabulary priming is enabled.
 */
function isPromptNotSupportedError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const msg = (e.message || "").toLowerCase();
  return (
    e.status === 400 &&
    msg.includes("prompt") &&
    (msg.includes("not supported") || msg.includes("unsupported"))
  );
}

export class AzureOpenAIProvider implements AIProvider {
  readonly name = "azure-openai";

  async transcribe(
    file: File,
    options: TranscribeOptions = {}
  ): Promise<TranscriptionResult> {
    const openai = createOpenAIClient();
    const model = whisperDeployment();
    type CreateParams = Parameters<
      typeof openai.audio.transcriptions.create
    >[0];

    // The two axes on which an Azure deployment might reject our params:
    //   - response_format: some deployments want "json" instead of
    //     "verbose_json" (isIncompatibleResponseFormatError).
    //   - prompt: gpt-4o-transcribe-diarize rejects it outright
    //     (isPromptNotSupportedError).
    // Loop through the combinations in order of preference, dropping
    // whichever param the deployment complains about.
    let useVerbose = true;
    let usePrompt = !!options.prompt;
    let raw: RawTranscriptionResult | null = null;
    let lastErr: unknown = null;
    // At most 4 iterations: (verbose,prompt) → (verbose,no-prompt) →
    // (json,no-prompt) → give up. In practice we hit the working
    // combination in 1-2 attempts.
    for (let attempt = 0; attempt < 4; attempt++) {
      const params = {
        model,
        file,
        ...(options.language ? { language: options.language } : {}),
        ...(usePrompt && options.prompt ? { prompt: options.prompt } : {}),
        response_format: useVerbose ? "verbose_json" : "json",
        ...(useVerbose
          ? { timestamp_granularities: ["word", "segment"] }
          : {}),
      };
      try {
        raw = (await openai.audio.transcriptions.create(
          params as unknown as CreateParams
        )) as unknown as RawTranscriptionResult;
        break;
      } catch (err) {
        lastErr = err;
        if (isPromptNotSupportedError(err) && usePrompt) {
          usePrompt = false;
          continue;
        }
        if (isIncompatibleResponseFormatError(err) && useVerbose) {
          useVerbose = false;
          continue;
        }
        throw err;
      }
    }
    if (!raw) throw lastErr ?? new Error("Transcription failed after retries.");

    const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
    const segments: TranscriptionSegment[] = rawSegments
      .filter((s) => typeof s.text === "string" && (s.text ?? "").trim() !== "")
      .map((s) => ({
        speaker: (s.speaker || "speaker_0").toString(),
        text: (s.text ?? "").trim(),
        start: typeof s.start === "number" ? s.start : 0,
        end: typeof s.end === "number" ? s.end : 0,
      }));

    return {
      text: raw.text ?? "",
      segments,
      language: raw.language ?? options.language ?? null,
    };
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<ChatResult> {
    const openai = createChatOpenAIClient();
    const completion = await openai.chat.completions.create(
      {
        model: chatDeployment(),
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      },
      options.signal ? { signal: options.signal } : undefined
    );
    const text = completion.choices[0]?.message?.content ?? "";
    const usage = completion.usage
      ? {
          inputTokens: completion.usage.prompt_tokens ?? 0,
          outputTokens: completion.usage.completion_tokens ?? 0,
        }
      : undefined;
    return { text, usage };
  }
}
