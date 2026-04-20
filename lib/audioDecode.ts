/**
 * Audio-chunk decoding utilities for client-side voice embedding.
 *
 * The capture pipeline produces webm/opus (or AAC on iOS) Blobs via
 * MediaRecorder. The speaker-embedding model needs 16 kHz mono PCM.
 * This module handles:
 *
 *   1. Blob → decoded AudioBuffer via Web Audio API.
 *   2. Stereo → mono downmix.
 *   3. Linear resampling to 16 kHz (the VoxCeleb-class models' native
 *      input rate). Linear is cheap and sufficient for speaker
 *      verification — we aren't doing ASR here.
 *   4. Slicing by time offsets so we can embed one speaker at a time
 *      using the diarizer's segment timestamps.
 *
 * SSR-safe: every entry point checks for `window` / `AudioContext`
 * and returns a null result when unavailable.
 */

"use client";

const TARGET_SAMPLE_RATE = 16000;

export type DecodedChunk = {
  pcm: Float32Array;
  sampleRate: number;
};

type AnyWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/**
 * Decode a chunk Blob (webm/opus, aac, etc.) into mono Float32Array
 * PCM at the target sample rate. Returns null when Web Audio isn't
 * available or decoding fails (e.g. fragmentary chunk on iOS).
 */
export async function decodeChunkToPcm(
  blob: Blob
): Promise<DecodedChunk | null> {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext || (window as AnyWindow).webkitAudioContext;
  if (!Ctor) return null;
  const buffer = await blob.arrayBuffer();
  let audio: AudioBuffer;
  const ctx = new Ctor();
  try {
    audio = await ctx.decodeAudioData(buffer.slice(0));
  } catch {
    await ctx.close().catch(() => {});
    return null;
  }
  const numChannels = audio.numberOfChannels;
  const length = audio.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const data = audio.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numChannels;
  }
  const srcRate = audio.sampleRate;
  await ctx.close().catch(() => {});
  if (srcRate === TARGET_SAMPLE_RATE) {
    return { pcm: mono, sampleRate: srcRate };
  }
  return { pcm: resampleLinear(mono, srcRate, TARGET_SAMPLE_RATE), sampleRate: TARGET_SAMPLE_RATE };
}

/**
 * Slice PCM between `startSec` and `endSec` inclusive. Clamps to the
 * buffer bounds and returns an empty Float32Array when the slice is
 * non-positive.
 */
export function slicePcm(
  pcm: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number
): Float32Array {
  const start = Math.max(0, Math.floor(startSec * sampleRate));
  const end = Math.min(pcm.length, Math.floor(endSec * sampleRate));
  if (end <= start) return new Float32Array(0);
  return pcm.subarray(start, end);
}

/**
 * Linear resampling. Cheaper than a proper polyphase filter but
 * adequate for speaker-verification models that rely on pitch +
 * spectral envelope, not fine-grained phase information.
 */
function resampleLinear(
  pcm: Float32Array,
  srcRate: number,
  dstRate: number
): Float32Array {
  if (srcRate === dstRate) return pcm;
  const ratio = srcRate / dstRate;
  const outLen = Math.max(1, Math.floor(pcm.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = srcIdx - i0;
    out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac;
  }
  return out;
}

/**
 * Concatenate an ordered list of PCM slices. Returns an empty buffer
 * when every slice is empty — callers should guard against that
 * before embedding (embedding zeros produces a noisy, meaningless
 * vector).
 */
export function concatPcm(slices: Float32Array[]): Float32Array {
  let total = 0;
  for (const s of slices) total += s.length;
  if (total === 0) return new Float32Array(0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const s of slices) {
    out.set(s, offset);
    offset += s.length;
  }
  return out;
}
