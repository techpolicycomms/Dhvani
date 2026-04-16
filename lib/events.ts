/**
 * Lightweight in-process event bus for Dhvani-internal signals.
 *
 * Today the only subscriber is the optional webhook URL
 * (NOTIFICATION_WEBHOOK_URL); the bus is here so future features
 * (Teams/Slack notifications, SharePoint sync, analytics pipelines)
 * can be wired in without threading new callbacks through every API
 * route.
 *
 * Intentionally process-local. Multi-node deployments should swap
 * `emit` for a queue-backed implementation (SQS, Kafka, Redis Streams)
 * behind this same shape.
 */

export type DhvaniEvent =
  | {
      type: "transcription.started";
      meetingSubject?: string | null;
      userId: string;
    }
  | {
      type: "transcription.completed";
      transcriptId: string;
      userId: string;
      durationSeconds: number;
    }
  | { type: "summary.generated"; transcriptId: string | null; userId: string }
  | {
      type: "transcript.shared";
      transcriptId: string;
      userId: string;
      shareUrl: string;
    }
  | {
      type: "transcript.exported";
      transcriptId: string;
      format: string;
      userId: string;
    };

type Listener = (event: DhvaniEvent) => void | Promise<void>;

class EventBus {
  private listeners = new Map<DhvaniEvent["type"] | "*", Listener[]>();

  on(eventType: DhvaniEvent["type"] | "*", callback: Listener): () => void {
    const arr = this.listeners.get(eventType) ?? [];
    arr.push(callback);
    this.listeners.set(eventType, arr);
    return () => {
      const current = this.listeners.get(eventType);
      if (!current) return;
      this.listeners.set(
        eventType,
        current.filter((l) => l !== callback)
      );
    };
  }

  /**
   * Fire-and-forget emit. Listener errors are caught so one bad
   * subscriber can't poison the route that produced the event.
   */
  emit(event: DhvaniEvent): void {
    const specific = this.listeners.get(event.type) ?? [];
    const wildcard = this.listeners.get("*") ?? [];
    for (const fn of [...specific, ...wildcard]) {
      try {
        const result = fn(event);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch((err) => {
            console.warn("[events] listener rejected", event.type, err);
          });
        }
      } catch (err) {
        console.warn("[events] listener threw", event.type, err);
      }
    }
  }
}

export const events = new EventBus();

// Optional built-in webhook: fires on every event when
// NOTIFICATION_WEBHOOK_URL is configured. Zapier/Make/Teams/Slack can
// all consume plain JSON over HTTP, so one listener handles the lot.
events.on("*", async (event) => {
  const url = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...event, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    console.warn("[events] webhook failed", err);
  }
});
