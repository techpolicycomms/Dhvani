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

export class AzureOpenAIProvider implements AIProvider {
  readonly name = "azure-openai";

  async transcribe(
    file: File,
    options: TranscribeOptions = {}
  ): Promise<TranscriptionResult> {
    const openai = createOpenAIClient();
    const model = whisperDeployment();
    const shared = {
      model,
      file,
      ...(options.language ? { language: options.language } : {}),
      // Prompt priming: biases the model toward domain vocabulary
      // (ITU acronyms, proper nouns). Harmless when absent.
      ...(options.prompt ? { prompt: options.prompt } : {}),
    };
    type CreateParams = Parameters<
      typeof openai.audio.transcriptions.create
    >[0];

    let raw: RawTranscriptionResult;
    try {
      raw = (await openai.audio.transcriptions.create({
        ...shared,
        response_format: "verbose_json",
        timestamp_granularities: ["word", "segment"],
      } as unknown as CreateParams)) as unknown as RawTranscriptionResult;
    } catch (err) {
      if (!isIncompatibleResponseFormatError(err)) throw err;
      raw = (await openai.audio.transcriptions.create({
        ...shared,
        response_format: "json",
      } as unknown as CreateParams)) as unknown as RawTranscriptionResult;
    }

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
