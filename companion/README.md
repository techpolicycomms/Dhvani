# Dhvani Desktop Companion

A tiny Python script that captures audio from a local input device (microphone, BlackHole, VB-Cable, or any loopback device) and streams it to the Dhvani web app over WebSocket. Use this when:

- You want to transcribe audio from a **desktop** meeting client (Zoom, Teams, WebEx).
- You don't want to install the Electron app.
- You're comfortable running a Python command alongside your browser.

## Install

Requires Python 3.9+.

```bash
cd companion
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

On **macOS**, `sounddevice` needs PortAudio:

```bash
brew install portaudio
```

On **Linux**:

```bash
sudo apt install libportaudio2
```

On **Windows**, no extra steps are needed.

## Usage

List input devices:

```bash
python capture.py --list
```

Pick a device interactively:

```bash
python capture.py
```

Run headless against a named device (substring match):

```bash
python capture.py --device "BlackHole 2ch"
python capture.py --device "CABLE Output"
python capture.py --device 3                # numeric index
python capture.py --device "Built-in" --port 3001
```

## Wiring it into Dhvani

1. Install a virtual audio cable (BlackHole on macOS, VB-CABLE on Windows) and route your meeting audio into it — see [docs/desktop-setup](../app/desktop-setup/page.tsx) in the web app.
2. Run `npm run dev` to start Dhvani locally (`http://localhost:3000`).
3. Run `python capture.py --device "<your virtual cable>"`.
4. Dhvani's WebSocket listener picks up the chunks, feeds them through Whisper, and displays the transcript.

## Troubleshooting

- **`PortAudioError: Error opening InputStream`** — the device is in use by another app or the chosen sample rate isn't supported. Try `--device <different>` or lower `SAMPLE_RATE` in `capture.py`.
- **Silent chunks** — confirm the OS is routing audio into your virtual cable. On macOS use a Multi-Output Device; on Windows, set CABLE Input as the default playback device.
- **WebSocket refused** — make sure Dhvani's WebSocket listener is running (same port as `--port`, default `3001`).

## Shutdown

`Ctrl+C` sends SIGINT and the script exits cleanly.
