import Link from "next/link";
import { Globe, Monitor } from "lucide-react";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

async function getLatestInstallerLinks(): Promise<{ macUrl: string; winUrl: string }> {
  const fallback = {
    macUrl: "https://github.com/techpolicycomms/Dhvani/releases/latest",
    winUrl: "https://github.com/techpolicycomms/Dhvani/releases/latest",
  };

  try {
    const response = await fetch("https://api.github.com/repos/techpolicycomms/Dhvani/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return fallback;
    }

    const release = (await response.json()) as { assets?: ReleaseAsset[] };
    const assets = release.assets ?? [];
    const mac = assets.find((asset) => asset.name.endsWith(".dmg"));
    const win = assets.find((asset) => asset.name.endsWith(".exe"));

    return {
      macUrl: mac?.browser_download_url ?? fallback.macUrl,
      winUrl: win?.browser_download_url ?? fallback.winUrl,
    };
  } catch {
    return fallback;
  }
}

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const buttonStyle: React.CSSProperties = {
  background: "#1DA0DB",
  color: "#FFFFFF",
  borderRadius: 6,
  padding: "9px 16px",
  textAlign: "center",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  minHeight: 36,
};

export default async function DownloadPage() {
  const { macUrl, winUrl } = await getLatestInstallerLinks();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        fontFamily: "Noto Sans, sans-serif",
        padding: "24px 16px",
      }}
    >
      <div style={{ maxWidth: 1024, margin: "0 auto" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#003366", marginBottom: 4 }}>
          Download Dhvani
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>Choose your platform</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Globe size={20} color="#1DA0DB" />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#003366",
                  background: "#E8F4FA",
                  borderRadius: 999,
                  padding: "3px 8px",
                }}
              >
                Recommended
              </span>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#003366" }}>Use in Browser</h2>
            <p style={{ fontSize: 14, color: "#1F2937", margin: 0 }}>
              No install needed. Works on any device.
            </p>
            <Link href="/" style={buttonStyle}>
              Open Dhvani
            </Link>
          </section>

          <section style={cardStyle}>
            <Monitor size={20} color="#1DA0DB" />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#003366" }}>Mac App</h2>
            <p style={{ fontSize: 14, color: "#1F2937", margin: 0 }}>
              Native desktop app with system audio capture.
            </p>
            <a href={macUrl} style={buttonStyle}>
              Download .dmg
            </a>
            <p style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", margin: 0 }}>
              macOS 12 or later · Apple Silicon &amp; Intel
            </p>
          </section>

          <section style={cardStyle}>
            <Monitor size={20} color="#1DA0DB" />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "#003366" }}>Windows App</h2>
            <p style={{ fontSize: 14, color: "#1F2937", margin: 0 }}>
              Native desktop app with system audio capture.
            </p>
            <a href={winUrl} style={buttonStyle}>
              Download .exe
            </a>
            <p style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", margin: 0 }}>
              Windows 10 or later · 64-bit
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
