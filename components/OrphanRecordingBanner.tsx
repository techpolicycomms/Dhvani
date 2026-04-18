"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Trash2, X } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  discardSession,
  listOrphanSessions,
  recoverSession,
  type OrphanSession,
} from "@/lib/audioPersistence";
import { useTranscriptionContext } from "@/contexts/TranscriptionContext";
import type { CapturedChunk } from "@/hooks/useAudioCapture";

/**
 * Sticky banner that surfaces sessions whose manifest is still marked
 * "recording" — i.e. the browser was closed or the tab crashed mid-
 * meeting. The user can Recover (feed the persisted chunks back through
 * the transcription pipeline) or Discard (throw the audio away).
 *
 * Only renders when at least one orphan exists AND nothing is currently
 * recording. Mounted once in the root layout so it works across routes.
 */
export function OrphanRecordingBanner() {
  const { capture, tx, setToast } = useTranscriptionContext();
  const { status } = useSession();
  const [orphans, setOrphans] = useState<OrphanSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (capture.isCapturing) return;
    if (status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      const found = await listOrphanSessions();
      if (!cancelled) setOrphans(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [capture.isCapturing, status]);

  // Week 3 — offline queue completion. When the browser comes back
  // online, silently auto-resume any pending orphan sessions instead
  // of waiting for the user to click Recover. The banner still shows
  // for sessions older than the current navigator-online cycle so the
  // user has a chance to discard if they don't want them transcribed.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    const onOnline = async () => {
      const pending = await listOrphanSessions();
      if (pending.length === 0) return;
      const total = pending.reduce((n, p) => n + p.chunkIndexes.length, 0);
      setToast(
        `Reconnected — auto-resuming ${total} pending chunk${total === 1 ? "" : "s"} across ${pending.length} session${pending.length === 1 ? "" : "s"}.`
      );
      window.setTimeout(() => setToast(null), 5000);
      for (const orphan of pending) {
        await handleRecoverInternal(orphan);
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // handleRecoverInternal is defined below; eslint will warn — safe
    // because it only reads the closed-over `tx` which is stable for
    // the lifetime of TranscriptionProvider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, setToast]);

  // Internal helper used by both manual click and auto-resume.
  const handleRecoverInternal = useCallback(
    async (orphan: OrphanSession) => {
      const { blobs } = await recoverSession(orphan.meta.id);
      blobs.forEach((blob, i) => {
        const capturedAtMs = (orphan.chunkIndexes[i] ?? i) * 1500;
        const chunk: CapturedChunk = {
          index: orphan.chunkIndexes[i] ?? i,
          blob,
          mimeType: orphan.meta.mimeType || "audio/webm",
          extension: orphan.meta.extension || "webm",
          capturedAtMs,
          durationMs: 1500,
          sessionId: orphan.meta.id,
        };
        tx.transcribeChunk(chunk);
      });
      setOrphans((prev) => prev.filter((o) => o.meta.id !== orphan.meta.id));
    },
    [tx]
  );

  const handleRecover = useCallback(
    async (orphan: OrphanSession) => {
      setBusyId(orphan.meta.id);
      try {
        await handleRecoverInternal(orphan);
      } catch (err) {
        console.warn("[OrphanRecovery] recover failed", err);
      } finally {
        setBusyId(null);
      }
    },
    [handleRecoverInternal]
  );

  const handleDiscard = useCallback(async (orphan: OrphanSession) => {
    setBusyId(orphan.meta.id);
    try {
      await discardSession(orphan.meta.id);
      setOrphans((prev) => prev.filter((o) => o.meta.id !== orphan.meta.id));
    } catch (err) {
      console.warn("[OrphanRecovery] discard failed", err);
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  const visible = orphans.filter((o) => !dismissedIds.has(o.meta.id));
  if (visible.length === 0 || capture.isCapturing || status !== "authenticated") {
    return null;
  }

  return (
    <div className="fixed top-[10px] left-1/2 -translate-x-1/2 z-40 max-w-lg w-[calc(100%-2rem)]">
      {visible.map((orphan) => {
        const started = new Date(orphan.meta.startedAt);
        const timeLabel = started.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateLabel = started.toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
        const chunkCount = orphan.chunkIndexes.length;
        const busy = busyId === orphan.meta.id;
        return (
          <div
            key={orphan.meta.id}
            className="mb-2 bg-white border border-amber-300 rounded-xl shadow-lg p-3 flex items-start gap-3"
            role="alert"
          >
            <AlertTriangle
              size={18}
              className="text-amber-500 shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-dark-navy">
                Incomplete recording from {dateLabel}, {timeLabel}
              </div>
              <div className="text-[11px] text-mid-gray mt-0.5">
                {chunkCount} audio chunk{chunkCount === 1 ? "" : "s"} still
                saved locally. Recover to transcribe, or discard to free
                space.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRecover(orphan)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-itu-blue text-white px-2.5 py-1 rounded-md hover:bg-itu-blue-dark disabled:opacity-60"
                >
                  <RefreshCw size={12} />
                  Recover
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscard(orphan)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-white text-error border border-error/40 px-2.5 py-1 rounded-md hover:bg-error/5 disabled:opacity-60"
                >
                  <Trash2 size={12} />
                  Discard
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDismiss(orphan.meta.id)}
              aria-label="Dismiss"
              className="text-mid-gray hover:text-dark-navy shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
