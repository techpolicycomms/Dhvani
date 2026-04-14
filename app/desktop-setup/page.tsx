"use client";

import Link from "next/link";
import { useState } from "react";
import { AudioRoutingDiagram } from "@/components/AudioRoutingDiagram";

/**
 * Virtual-cable setup guide for users running the Zoom / Teams desktop
 * app instead of a browser tab. Two tabs: macOS (BlackHole) and
 * Windows (VB-Cable).
 */
export default function DesktopSetupPage() {
  const [platform, setPlatform] = useState<"mac" | "windows">("mac");

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-10">
      <Link href="/" className="text-sm text-teal hover:text-teal-dark">
        ← Back to Dhvani
      </Link>
      <h1 className="text-3xl font-bold mt-3 mb-2">Desktop App Setup</h1>
      <p className="text-white/70 mb-6">
        Running Zoom, Teams, or another meeting app as a desktop install?
        A free virtual audio cable lets Dhvani hear the meeting while you
        still hear it in your speakers.
      </p>

      <div className="flex gap-2 mb-6">
        <Tab active={platform === "mac"} onClick={() => setPlatform("mac")}>
          macOS
        </Tab>
        <Tab
          active={platform === "windows"}
          onClick={() => setPlatform("windows")}
        >
          Windows
        </Tab>
      </div>

      <div className="rounded-lg border border-white/10 bg-navy-light/40 p-5 mb-6">
        <AudioRoutingDiagram platform={platform} className="w-full h-auto" />
      </div>

      {platform === "mac" ? <MacSteps /> : <WindowsSteps />}

      <div className="mt-8 p-4 rounded border border-white/10 bg-navy-light/40 text-sm">
        <strong className="text-teal">Prefer no virtual cable?</strong>{" "}
        <span className="text-white/80">
          Install the Dhvani Electron app, which captures system audio
          natively — no extra drivers required.
        </span>{" "}
        <Link
          href="https://github.com/techpolicycomms/dhvani#electron-desktop-app"
          className="text-teal hover:text-teal-dark"
        >
          Learn more ↗
        </Link>
      </div>
    </main>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
        active
          ? "bg-teal text-navy border-teal"
          : "bg-navy-light/40 border-white/10 text-white/70 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function MacSteps() {
  return (
    <ol className="space-y-4 text-sm leading-relaxed">
      <Step n={1}>
        Install{" "}
        <a
          href="https://existential.audio/blackhole/"
          target="_blank"
          rel="noreferrer"
          className="text-teal hover:text-teal-dark"
        >
          BlackHole (free, open source)
        </a>
        . Choose the <code>2ch</code> variant.
      </Step>
      <Step n={2}>
        Open <strong>Audio MIDI Setup</strong> (Applications → Utilities).
        Click the <strong>+</strong> in the bottom-left and choose{" "}
        <strong>Create Multi-Output Device</strong>.
      </Step>
      <Step n={3}>
        In the Multi-Output Device, check both your usual{" "}
        <em>speakers/headphones</em> <strong>and</strong>{" "}
        <em>BlackHole 2ch</em>.
      </Step>
      <Step n={4}>
        In <strong>System Settings → Sound → Output</strong>, select the
        Multi-Output Device. You&apos;ll still hear audio through your
        speakers, but it&apos;s also being routed into BlackHole.
      </Step>
      <Step n={5}>
        In Dhvani <strong>Settings → Audio Input Device</strong>, pick{" "}
        <strong>BlackHole 2ch</strong>. Set the source in the setup wizard
        to <strong>Desktop app</strong>.
      </Step>
      <Step n={6}>
        Start your Zoom / Teams / Meet desktop app normally — audio now
        flows through BlackHole to Dhvani <em>and</em> to your speakers.
      </Step>
    </ol>
  );
}

function WindowsSteps() {
  return (
    <ol className="space-y-4 text-sm leading-relaxed">
      <Step n={1}>
        Install{" "}
        <a
          href="https://vb-audio.com/Cable/"
          target="_blank"
          rel="noreferrer"
          className="text-teal hover:text-teal-dark"
        >
          VB-CABLE (free)
        </a>
        . Run the installer as administrator and reboot.
      </Step>
      <Step n={2}>
        Open <strong>Sound Settings</strong> and set{" "}
        <strong>CABLE Input (VB-Audio)</strong> as the default{" "}
        <strong>Playback</strong> device.
      </Step>
      <Step n={3}>
        Go to <strong>Sound → Recording</strong>, right-click{" "}
        <strong>CABLE Output</strong> → <strong>Properties → Listen</strong>,
        check <em>Listen to this device</em>, and pick your real speakers
        or headphones. (This is what lets you still hear the meeting.)
      </Step>
      <Step n={4}>
        In Dhvani <strong>Settings → Audio Input Device</strong>, pick{" "}
        <strong>CABLE Output (VB-Audio)</strong>. Set the source in the
        setup wizard to <strong>Desktop app</strong>.
      </Step>
      <Step n={5}>
        Start your meeting app normally — audio now routes through the
        cable to Dhvani and to your speakers.
      </Step>
    </ol>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="shrink-0 w-7 h-7 rounded-full bg-teal text-navy flex items-center justify-center text-sm font-bold">
        {n}
      </span>
      <div className="pt-0.5 text-white/85">{children}</div>
    </li>
  );
}
