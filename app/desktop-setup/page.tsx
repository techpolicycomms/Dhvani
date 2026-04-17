"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, Download } from "lucide-react";
import { AudioRoutingDiagram } from "@/components/AudioRoutingDiagram";

/**
 * Desktop-app capture guide. Leads with the Dhvani desktop app (native
 * system-audio capture, no extra drivers) and keeps the virtual-cable
 * workflow available as a collapsible fallback for users who can't
 * install the desktop build.
 */
export default function DesktopSetupPage() {
  const [platform, setPlatform] = useState<"mac" | "windows">("mac");

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-10 pt-10 bg-off-white min-h-screen">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-itu-blue-dark hover:text-itu-blue"
      >
        <ArrowLeft size={14} /> Back to Dhvani
      </Link>
      <h1 className="text-3xl font-bold mt-3 mb-2 text-dark-navy">
        Transcribe desktop meeting apps
      </h1>
      <p className="text-mid-gray mb-6">
        Want Dhvani to hear your Teams, Zoom, Webex, Slack, or WhatsApp
        desktop calls? The easiest path is the Dhvani desktop app — no
        extra drivers, no system settings to change.
      </p>

      <section className="rounded-xl border border-itu-blue bg-white p-5 mb-8 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-1 w-8 h-8 rounded-full bg-itu-blue-pale text-itu-blue-dark flex items-center justify-center">
            <Download size={16} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-dark-navy">
              Install the Dhvani desktop app (recommended)
            </h2>
            <p className="mt-1 text-sm text-mid-gray">
              Captures system audio natively via the Electron bridge. Works
              with every desktop meeting client — Teams, Zoom, Webex, Google
              Meet, Slack, WhatsApp, Skype, and more.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-dark-navy">
              <li className="flex items-center gap-2">
                <Check size={14} className="text-itu-blue-dark" /> No
                BlackHole / VB-Cable install
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-itu-blue-dark" /> No system
                audio routing changes
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-itu-blue-dark" /> You still
                hear the meeting on your speakers, unchanged
              </li>
            </ul>
            <div className="mt-4 flex gap-2">
              <Link
                href="/download"
                className="inline-flex items-center gap-2 bg-itu-blue text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-itu-blue-dark"
              >
                <Download size={14} /> Download Dhvani
              </Link>
            </div>
          </div>
        </div>
      </section>

      <details className="rounded-lg border border-border-gray bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-dark-navy">
          Advanced: set up a virtual audio cable instead
        </summary>
        <div className="mt-4 text-sm text-mid-gray">
          <p className="mb-5">
            Only needed if you can&apos;t install the Dhvani desktop app. A
            free virtual audio cable lets the web app hear your meeting
            while you still hear it in your speakers. Takes about 5
            minutes.
          </p>

          <div className="flex gap-2 mb-5">
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

          <div className="rounded-lg border border-border-gray bg-off-white p-5 mb-5">
            <AudioRoutingDiagram
              platform={platform}
              className="w-full h-auto"
            />
          </div>

          {platform === "mac" ? <MacSteps /> : <WindowsSteps />}
        </div>
      </details>
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
          ? "bg-itu-blue text-white border-itu-blue"
          : "bg-white border-border-gray text-mid-gray hover:text-dark-navy",
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
          className="text-itu-blue-dark hover:text-itu-blue"
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
          className="text-itu-blue-dark hover:text-itu-blue"
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
      <span className="shrink-0 w-7 h-7 rounded-full bg-itu-blue text-white flex items-center justify-center text-sm font-bold">
        {n}
      </span>
      <div className="pt-0.5 text-dark-gray">{children}</div>
    </li>
  );
}
