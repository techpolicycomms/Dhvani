"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { DEFAULT_CHUNK_DURATION_MS } from "@/lib/constants";

/**
 * Orphan-session auto-recovery.
 *
 * The pipeline is designed so no audio is ever lost — every chunk is
 * persisted to OPFS before it's transcribed, and a session whose
 * manifest is still marked "recording" (the tab crashed, the browser
 * died, the user force-quit) has its chunks sitting on disk waiting
 * to be fed back through the transcription API.
 *
 * The previous UX put that recovery behind a user click (Recover /
 * Discard banner). That's wrong — it surfaces "you almost lost audio"
 * anxiety for a system that's been explicitly built to never lose
 * audio. Replaced with silent auto-recovery on every mount + on the
 * `online` event: chunks dispatch through the pipeline unattended,
 * land in the Library, and the user sees nothing.
 *
 * The banner stays as a genuine failure fallback — it only appears if
 * a recovery attempt throws (disk corrupted, OPFS handle revoked,
 * etc.). In that narrow case users see the Recover / Discard choice
 * and can manually resolve.
 */
export function OrphanRecordingBanner() {
  const { capture, tx } = useTranscriptionContext();
  const { status } = useSession();
  const [failedOrphans, setFailedOrphans] = useState<OrphanSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // Track orphans we've already kicked into auto-recovery this session
  // so a re-mount (fast React re-render, page nav) doesn't double-dispatch
  // the same chunks.
  const inFlightIdsRef = useRef<Set<string>>(new Set());

  // Feed one orphan's chunks back through the live transcription pipeline.
  // Does NOT touch UI state — recovery should be invisible on the happy path.
  const silentRecover = useCallback(
    async (orphan: OrphanSession) => {
      if (inFlightIdsRef.current.has(orphan.meta.id)) return;
      inFlightIdsRef.current.add(orphan.meta.id);
      try {
        const { blobs } = await recoverSession(orphan.meta.id);
        blobs.forEach((blob, i) => {
          const chunkIndex = orphan.chunkIndexes[i] ?? i;
          const chunk: CapturedChunk = {
            index: chunkIndex,
            blob,
            mimeType: orphan.meta.mimeType || "audio/webm",
            extension: orphan.meta.extension || "webm",
            capturedAtMs: chunkIndex * DEFAULT_CHUNK_DURATION_MS,
            durationMs: DEFAULT_CHUNK_DURATION_MS,
            sessionId: orphan.meta.id,
          };
          tx.transcribeChunk(chunk);
        });
      } catch (err) {
        // Disk / OPFS / IDB trouble — rare. Surface the banner so the
        // user can see what's stuck and decide.
        console.warn("[OrphanRecovery] auto-recover failed", err);
        setFailedOrphans((prev) => {
          if (prev.some((o) => o.meta.id === orphan.meta.id)) return prev;
          return [...prev, orphan];
        });
        throw err;
      }
    },
    [tx]
  );

  // Sweep on mount: every session whose manifest is still "recording"
  // gets auto-recovered the moment the app comes up. Skipped while a
  // recording is active — we don't want to tangle the live session with
  // dispatch of chunks from a crashed one.
  useEffect(() => {
    if (capture.isCapturing) return;
    if (status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      const orphans = await listOrphanSessions();
      if (cancelled || orphans.length === 0) return;
      for (const orphan of orphans) {
        try {
          await silentRecover(orphan);
        } catch {
          /* surfaced via failedOrphans */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [capture.isCapturing, status, silentRecover]);

  // Online-again sweep: if the browser dropped offline mid-session and
  // reconnects, pick up anything that didn't finish.
  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;
    const onOnline = async () => {
      const pending = await listOrphanSessions();
      for (const orphan of pending) {
        try {
          await silentRecover(orphan);
        } catch {
          /* already surfaced */
        }
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status, silentRecover]);

  const handleManualRecover = useCallback(
    async (orphan: OrphanSession) => {
      setBusyId(orphan.meta.id);
      try {
        // Manual retry — clear the failed flag first so silentRecover
        // doesn't short-circuit on the inFlight guard.
        inFlightIdsRef.current.delete(orphan.meta.id);
        await silentRecover(orphan);
        setFailedOrphans((prev) =>
          prev.filter((o) => o.meta.id !== orphan.meta.id)
        );
      } catch (err) {
        console.warn("[OrphanRecovery] manual recover failed", err);
      } finally {
        setBusyId(null);
      }
    },
    [silentRecover]
  );

  const handleDiscard = useCallback(async (orphan: OrphanSession) => {
    setBusyId(orphan.meta.id);
    try {
      await discardSession(orphan.meta.id);
      setFailedOrphans((prev) =>
        prev.filter((o) => o.meta.id !== orphan.meta.id)
      );
    } catch (err) {
      console.warn("[OrphanRecovery] discard failed", err);
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  const visible = failedOrphans.filter((o) => !dismissedIds.has(o.meta.id));
  if (
    visible.length === 0 ||
    capture.isCapturing ||
    status !== "authenticated"
  ) {
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
                Couldn&apos;t finish recovery automatically
              </div>
              <div className="text-[11px] text-mid-gray mt-0.5">
                Recording from {dateLabel}, {timeLabel}. Retry below, or
                discard if you don&apos;t need it.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleManualRecover(orphan)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-[11px] font-medium bg-itu-blue text-white px-2.5 py-1 rounded-md hover:bg-itu-blue-dark disabled:opacity-60"
                >
                  <RefreshCw size={12} />
                  Retry
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
