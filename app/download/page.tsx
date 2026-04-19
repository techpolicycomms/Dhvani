import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";
import {
  AlertTriangle,
  Download,
  Globe,
  Laptop,
  Monitor,
} from "lucide-react";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type InstallerLinks = {
  macUrl: string | null;
  winUrl: string | null;
  /** true when GitHub returned assets but the platform-specific one was missing. */
  macMissing: boolean;
  winMissing: boolean;
  /** Last successful release tag, for the "latest build" hint. */
  tag: string | null;
  /** Fallback URL always safe to click — the releases page. */
  releasesUrl: string;
  /** true when links come from /downloads/ (internal beta path), false when from GitHub. */
  fromLocalShelf: boolean;
};

// Don't cache — we want file presence re-checked every request while
// the internal-beta DMG shelf turns over.
export const dynamic = "force-dynamic";

/**
 * Look for DMG/EXE artifacts staged in `public/downloads/`. This is the
 * internal-beta distribution shelf: drop a build here and the /download
 * page serves it directly instead of asking GitHub Releases. Files are
 * gitignored so repo size stays bounded; the staging step lives in
 * `scripts/stage-local-artifacts.sh` (or any manual `cp` into the dir).
 *
 * Returns resolved web paths (served by Next.js from /public/), not FS
 * paths. Picks the most recent `.dmg`/`.exe` if there are multiples.
 */
async function findLocalArtifacts(): Promise<{
  macArm64?: string;
  macIntel?: string;
  win?: string;
}> {
  const dir = path.join(process.cwd(), "public", "downloads");
  try {
    const entries = await fs.readdir(dir);
    const dmgs = entries.filter((e) => e.endsWith(".dmg"));
    const exes = entries.filter((e) => e.endsWith(".exe"));
    const macArm64 = dmgs.find((n) => /arm64|aarch64/i.test(n));
    // Any .dmg that isn't arm64 is treated as the Intel build.
    const macIntel = dmgs.find((n) => n !== macArm64);
    const win = exes[0];
    return {
      macArm64: macArm64 ? `/downloads/${macArm64}` : undefined,
      macIntel: macIntel ? `/downloads/${macIntel}` : undefined,
      win: win ? `/downloads/${win}` : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Resolves the latest installer URLs from the GitHub Releases API.
 *
 * Behaviour contract:
 *   - If the API returns `.dmg` / `.exe` assets, we link to those directly.
 *   - If the API responds but no platform asset is present, we set
 *     `*Missing = true` and the card renders a disabled state instead of
 *     silently falling back to the generic releases page. This is what
 *     users complained about ("I can't download" — the link 404'd).
 *   - If the API is unreachable, we fall back to the releases page and
 *     show a soft notice so the page is still useful.
 */
async function getLatestInstallerLinks(): Promise<InstallerLinks> {
  const releasesUrl =
    "https://github.com/techpolicycomms/Dhvani/releases/latest";

  // Local shelf wins when present — internal beta distribution path.
  // ARM64 mac takes priority (Apple Silicon majority); we still expose
  // Intel as a secondary link below the card if both exist.
  const local = await findLocalArtifacts();
  if (local.macArm64 || local.macIntel || local.win) {
    return {
      macUrl: local.macArm64 || local.macIntel || null,
      winUrl: local.win ?? null,
      macMissing: !(local.macArm64 || local.macIntel),
      winMissing: !local.win,
      tag: "internal-beta",
      releasesUrl,
      fromLocalShelf: true,
    };
  }

  try {
    const response = await fetch(
      "https://api.github.com/repos/techpolicycomms/Dhvani/releases/latest",
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) {
      return {
        macUrl: null,
        winUrl: null,
        macMissing: false,
        winMissing: false,
        tag: null,
        releasesUrl,
        fromLocalShelf: false,
      };
    }

    const release = (await response.json()) as {
      assets?: ReleaseAsset[];
      tag_name?: string;
    };
    const assets = release.assets ?? [];
    const mac = assets.find((asset) =>
      /\.dmg$|-mac\.zip$/i.test(asset.name)
    );
    const win = assets.find((asset) => /\.exe$|-win\.zip$/i.test(asset.name));

    return {
      macUrl: mac?.browser_download_url ?? null,
      winUrl: win?.browser_download_url ?? null,
      // Only consider an asset "missing" if the API responded successfully
      // — otherwise we can't tell the difference.
      macMissing: !mac,
      winMissing: !win,
      tag: release.tag_name ?? null,
      releasesUrl,
      fromLocalShelf: false,
    };
  } catch (err) {
    console.warn("[download] GitHub release lookup failed", err);
    return {
      macUrl: null,
      winUrl: null,
      macMissing: false,
      winMissing: false,
      tag: null,
      releasesUrl,
      fromLocalShelf: false,
    };
  }
}

export default async function DownloadPage() {
  const links = await getLatestInstallerLinks();
  const bothMissing = links.macMissing && links.winMissing;

  return (
    <main className="min-h-screen bg-white text-dark-navy px-4 py-8 sm:py-10">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-dark-navy">Download Dhvani</h1>
        <p className="text-sm text-mid-gray mt-1">
          Choose your platform.{" "}
          {links.tag && (
            <span>
              Latest release:{" "}
              <code className="font-mono text-itu-blue-dark">{links.tag}</code>
            </span>
          )}
        </p>
        {links.fromLocalShelf && (
          <div className="mt-3 rounded-md border border-itu-blue/30 bg-itu-blue-pale px-3 py-2 text-[11px] text-itu-blue-dark">
            <strong className="font-semibold">Internal beta build</strong> —
            unsigned. First launch on macOS: right-click the app in Applications
            → Open → Open. On Windows: keep past the SmartScreen warning once.
          </div>
        )}

        {bothMissing && (
          <div
            role="alert"
            className="mt-4 flex gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-dark-navy"
          >
            <AlertTriangle
              size={18}
              className="shrink-0 text-warning mt-0.5"
              aria-hidden="true"
            />
            <div>
              <div className="font-semibold">
                Desktop installers aren&apos;t published yet
              </div>
              <p className="text-mid-gray mt-0.5">
                The browser version works on every device and matches the
                desktop feature set for most meetings. Desktop builds will
                land here once the release pipeline is green.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Browser — always works, recommended. */}
          <section className="rounded-xl border border-border-gray bg-white p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Globe size={22} className="text-itu-blue" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-itu-blue-dark bg-itu-blue-pale rounded-full px-2 py-0.5">
                Recommended
              </span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-dark-navy">
                Use in Browser
              </h2>
              <p className="text-sm text-dark-gray mt-1">
                No install needed. Works on any device.
              </p>
            </div>
            <Link
              href="/"
              className="mt-auto inline-flex items-center justify-center gap-2 bg-itu-blue text-white rounded-md px-4 py-2 text-sm font-semibold hover:bg-itu-blue-dark transition-colors"
            >
              Open Dhvani
            </Link>
          </section>

          {/* Mac */}
          <PlatformCard
            platform="mac"
            href={links.macUrl}
            missing={links.macMissing}
            releasesUrl={links.releasesUrl}
          />

          {/* Windows */}
          <PlatformCard
            platform="windows"
            href={links.winUrl}
            missing={links.winMissing}
            releasesUrl={links.releasesUrl}
          />
        </div>

        <p className="mt-6 text-xs text-mid-gray">
          Having trouble? Open an issue at{" "}
          <a
            href={links.releasesUrl}
            className="text-itu-blue-dark underline underline-offset-2 hover:text-itu-blue"
          >
            github.com/techpolicycomms/Dhvani/releases
          </a>
          .
        </p>
      </div>
    </main>
  );
}

function PlatformCard({
  platform,
  href,
  missing,
  releasesUrl,
}: {
  platform: "mac" | "windows";
  href: string | null;
  missing: boolean;
  releasesUrl: string;
}) {
  const isMac = platform === "mac";
  const title = isMac ? "Mac App" : "Windows App";
  const sub = isMac
    ? "macOS 12 or later · Apple Silicon & Intel"
    : "Windows 10 or later · 64-bit";
  const ext = isMac ? ".dmg" : ".exe";
  const Icon = isMac ? Laptop : Monitor;

  return (
    <section className="rounded-xl border border-border-gray bg-white p-5 flex flex-col gap-3">
      <Icon size={22} className="text-itu-blue" aria-hidden="true" />
      <div>
        <h2 className="text-base font-semibold text-dark-navy">{title}</h2>
        <p className="text-sm text-dark-gray mt-1">
          Native desktop app with system-audio capture.
        </p>
      </div>

      {href ? (
        <a
          href={href}
          className="mt-auto inline-flex items-center justify-center gap-2 bg-itu-blue text-white rounded-md px-4 py-2 text-sm font-semibold hover:bg-itu-blue-dark transition-colors"
        >
          <Download size={14} aria-hidden="true" />
          Download {ext}
        </a>
      ) : missing ? (
        // API confirmed the asset is missing — don't lie with a bogus link.
        <div className="mt-auto rounded-md border border-border-gray bg-light-gray px-4 py-2 text-xs text-mid-gray text-center">
          <span className="block font-semibold text-dark-navy">
            Not available yet
          </span>
          <a
            href={releasesUrl}
            className="text-itu-blue-dark underline underline-offset-2 hover:text-itu-blue"
          >
            Watch releases
          </a>
        </div>
      ) : (
        // API unreachable — generic fallback.
        <a
          href={releasesUrl}
          className="mt-auto inline-flex items-center justify-center gap-2 bg-white border border-border-gray text-dark-navy rounded-md px-4 py-2 text-sm font-semibold hover:bg-light-gray transition-colors"
        >
          <Download size={14} aria-hidden="true" />
          Browse releases
        </a>
      )}

      <p className="text-[11px] font-medium text-mid-gray">{sub}</p>
    </section>
  );
}
