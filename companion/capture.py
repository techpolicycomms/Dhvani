"""Dhvani desktop companion.

Captures audio from a chosen input device in 5-second WAV chunks and
streams each chunk over a WebSocket to the Dhvani web app. Useful when
you don't want to install Electron but still want to feed desktop app
audio (Zoom/Teams/etc.) into Dhvani.

Usage:
    python capture.py --device "BlackHole 2ch" --port 3001
    python capture.py                          # interactive picker

Install deps:
    pip install -r requirements.txt
"""

from __future__ import annotations

import argparse
import asyncio
import io
import signal
import sys
import wave
from typing import Optional

import numpy as np
import sounddevice as sd
import websockets

SAMPLE_RATE = 16_000
CHANNELS = 1
CHUNK_SECONDS = 5
DTYPE = "int16"


def list_devices() -> None:
    """Print a numbered list of input-capable audio devices."""
    print("Available audio input devices:\n")
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            print(f"  [{i}] {d['name']}  ({d['max_input_channels']} ch)")


def resolve_device(device_arg: Optional[str]) -> Optional[int | str]:
    """Accept a name substring, a numeric index, or None (default input)."""
    if device_arg is None:
        return None
    try:
        return int(device_arg)
    except ValueError:
        pass
    # Case-insensitive substring match against device names.
    lower = device_arg.lower()
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0 and lower in d["name"].lower():
            return i
    raise SystemExit(f"No input device matches '{device_arg}'. Run without --device for a list.")


def pcm_to_wav_bytes(pcm: np.ndarray) -> bytes:
    """Wrap a mono int16 PCM buffer as a standalone WAV file in memory."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(CHANNELS)
        wav.setsampwidth(2)  # int16
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())
    return buf.getvalue()


async def stream_chunks(device: Optional[int | str], port: int) -> None:
    uri = f"ws://localhost:{port}"
    print(f"Dhvani companion → connecting to {uri}…")
    print(f"Capturing from: {sd.query_devices(device)['name'] if device is not None else 'default input'}")
    print("Press Ctrl+C to stop.\n")

    frames_per_chunk = SAMPLE_RATE * CHUNK_SECONDS
    queue: asyncio.Queue[np.ndarray] = asyncio.Queue(maxsize=4)
    loop = asyncio.get_running_loop()
    buffer = np.zeros(0, dtype=np.int16)

    def callback(indata, frames, time, status):  # noqa: ARG001
        nonlocal buffer
        if status:
            print(f"  audio status: {status}", file=sys.stderr)
        mono = indata[:, 0] if indata.ndim > 1 else indata
        buffer = np.concatenate([buffer, mono.astype(np.int16, copy=False)])
        while buffer.size >= frames_per_chunk:
            chunk = buffer[:frames_per_chunk].copy()
            buffer = buffer[frames_per_chunk:]
            try:
                loop.call_soon_threadsafe(queue.put_nowait, chunk)
            except asyncio.QueueFull:
                print("  dropped a chunk (upstream backpressure)", file=sys.stderr)

    async def sender(ws):
        chunk_count = 0
        while True:
            chunk = await queue.get()
            wav_bytes = pcm_to_wav_bytes(chunk)
            await ws.send(wav_bytes)
            chunk_count += 1
            print(f"  → sent chunk {chunk_count} ({len(wav_bytes)/1024:.1f} KB)")

    while True:
        try:
            async with websockets.connect(uri, max_size=None) as ws:
                with sd.InputStream(
                    samplerate=SAMPLE_RATE,
                    channels=CHANNELS,
                    dtype=DTYPE,
                    device=device,
                    callback=callback,
                    blocksize=SAMPLE_RATE // 4,
                ):
                    await sender(ws)
        except (OSError, websockets.WebSocketException) as e:
            print(f"  connection error: {e} — retrying in 3s", file=sys.stderr)
            await asyncio.sleep(3)


def main() -> None:
    parser = argparse.ArgumentParser(description="Dhvani desktop audio companion.")
    parser.add_argument(
        "--device",
        help="Input device name substring or numeric index. Omit to pick interactively.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=3001,
        help="Port of the Dhvani WebSocket endpoint (default: 3001).",
    )
    parser.add_argument("--list", action="store_true", help="List input devices and exit.")
    args = parser.parse_args()

    if args.list:
        list_devices()
        return

    device: Optional[int | str]
    if args.device is None:
        list_devices()
        choice = input("\nPick a device index (blank for default): ").strip()
        device = int(choice) if choice else None
    else:
        device = resolve_device(args.device)

    # Graceful shutdown on Ctrl+C.
    def _sigint(*_):
        print("\nStopping Dhvani companion…")
        raise SystemExit(0)

    signal.signal(signal.SIGINT, _sigint)

    try:
        asyncio.run(stream_chunks(device, args.port))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
