"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";

type Props = {
  transcriptId: string;
  onClose: () => void;
};

export default function ShareModal({ transcriptId, onClose }: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>("7d");
  const [requireAuth, setRequireAuth] = useState(true);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transcripts/${transcriptId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ expiresIn, requireAuth }),
      });
      if (!res.ok) throw new Error("Failed");
      const body = await res.json();
      setShareUrl(body.shareUrl);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [transcriptId, expiresIn, requireAuth]);

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-gray">
          <div className="flex items-center gap-2 text-sm font-semibold text-dark-navy">
            <Link2 size={16} className="text-itu-blue" />
            Share Transcript
          </div>
          <button onClick={onClose} className="p-1 rounded text-mid-gray hover:text-dark-navy">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!shareUrl ? (
            <>
              <div>
                <label className="text-xs font-medium text-mid-gray uppercase tracking-wider">Expires</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  className="mt-1 w-full border border-border-gray rounded-lg px-3 py-2 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
                >
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                  <option value="never">Never</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-dark-navy">
                <input
                  type="checkbox"
                  checked={requireAuth}
                  onChange={(e) => setRequireAuth(e.target.checked)}
                  className="rounded border-border-gray text-itu-blue focus:ring-itu-blue/40"
                />
                Require sign-in to view
              </label>

              <button
                onClick={generate}
                disabled={loading}
                className="w-full px-4 py-2.5 bg-itu-blue text-white rounded-lg hover:bg-itu-blue-dark font-medium text-sm disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Generating...</span>
                ) : (
                  "Create share link"
                )}
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 text-sm border border-border-gray rounded-lg bg-light-gray text-dark-navy"
                />
                <button
                  onClick={copy}
                  className="px-3 py-2 bg-itu-blue text-white rounded-lg hover:bg-itu-blue-dark transition-colors"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <p className="text-xs text-mid-gray">
                {requireAuth ? "Recipients must sign in to view." : "Anyone with the link can view."}
                {expiresIn !== "never" && ` Expires in ${expiresIn}.`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
