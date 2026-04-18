"use client";

import { useEffect, useRef } from "react";

type Props = {
  stream: MediaStream | null;
  /** Idle = flat line when false. */
  active?: boolean;
  /** Number of bars. */
  bars?: number;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
};

/**
 * Lightweight live audio meter. Consumes the MediaStream from useAudioCapture
 * via Web Audio's AnalyserNode, paints ~20 vertical bars on a canvas keyed
 * off getByteFrequencyData(). Falls back to a flat idle pattern when there
 * is no stream (pre-start, post-stop, or Electron mode).
 */
export function AudioWaveform({
  stream,
  active = true,
  bars = 20,
  width = 120,
  height = 32,
  color = "#009CD6",
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx2d.scale(dpr, dpr);

    const drawIdle = () => {
      ctx2d.clearRect(0, 0, width, height);
      ctx2d.fillStyle = `${color}33`;
      const midY = height / 2;
      const barW = (width - (bars - 1) * 2) / bars;
      for (let i = 0; i < bars; i++) {
        const x = i * (barW + 2);
        ctx2d.fillRect(x, midY - 1, barW, 2);
      }
    };

    // No stream (or inactive): paint the idle pattern once, nothing else to do.
    if (!stream || !active) {
      drawIdle();
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      };
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) {
      drawIdle();
      return;
    }
    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const step = Math.max(1, Math.floor(data.length / bars));

    const draw = () => {
      analyser.getByteFrequencyData(data);
      ctx2d.clearRect(0, 0, width, height);
      ctx2d.fillStyle = color;
      const barW = (width - (bars - 1) * 2) / bars;
      for (let i = 0; i < bars; i++) {
        // Average a small slice so adjacent bars aren't identical.
        let sum = 0;
        const from = i * step;
        const to = Math.min(from + step, data.length);
        for (let j = from; j < to; j++) sum += data[j];
        const avg = sum / Math.max(1, to - from);
        // Map 0..255 → 2..height with a gentle curve so quiet rooms still
        // show some life rather than sitting on the floor.
        const normalized = Math.pow(avg / 255, 0.7);
        const barH = Math.max(2, normalized * height);
        const x = i * (barW + 2);
        const y = (height - barH) / 2;
        ctx2d.fillRect(x, y, barW, barH);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      // Closing the AudioContext releases the worklet. Some browsers
      // throw if the context is already closed (StrictMode double-invoke).
      audioCtx.close().catch(() => {
        /* ignore */
      });
    };
  }, [stream, active, bars, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height }}
      className={className}
      aria-hidden="true"
    />
  );
}
