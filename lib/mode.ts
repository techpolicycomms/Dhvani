/**
 * Personal / Power mode primitive.
 *
 * One toggle that flips the entire UI personality without losing data.
 * Personal = quiet, first-person ("What I heard"), no ITU branding.
 * Power = dense, third-person ("Meeting Summary"), Bureau visible, full nav.
 *
 * Persisted per-device in localStorage. Reading the value is a synchronous
 * function so any component can branch without going through React state.
 */

export type Mode = "personal" | "power";

const KEY = "dhvani-mode";

export function getStoredMode(): Mode {
  if (typeof window === "undefined") return "personal";
  const raw = window.localStorage.getItem(KEY);
  return raw === "power" ? "power" : "personal";
}

export function setStoredMode(mode: Mode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, mode);
  // Notify listeners — `useMode` below subscribes to this.
  window.dispatchEvent(new CustomEvent("dhvani-mode-change", { detail: mode }));
}

/**
 * Copy strings that differ between modes. Components read from this map
 * instead of branching inline so the surface stays visible.
 */
export const COPY: Record<
  Mode,
  {
    /** Footer disclaimer; null = hide entirely. */
    disclaimer: string | null;
    /** Recap section heading. */
    recapHeading: string;
    /** Action-items / follow-ups heading. */
    followUpsHeading: string;
    /** Filename prefix used in exports. */
    exportPrefix: string;
    /** Whether to show Bureau (BR/TSB/BDT/GS) tagging affordances. */
    bureauVisible: boolean;
    /** Whether to surface the admin dashboard nav link. */
    adminVisible: boolean;
    /** Greeting prefix on the home page. */
    greetingPrefix: string;
  }
> = {
  personal: {
    disclaimer: "Private — on your device",
    recapHeading: "What I heard",
    followUpsHeading: "My follow-ups",
    exportPrefix: "recap",
    bureauVisible: false,
    adminVisible: false,
    greetingPrefix: "Hi",
  },
  power: {
    disclaimer: null,
    recapHeading: "Meeting Summary",
    followUpsHeading: "Action Items",
    exportPrefix: "ITU-Meeting-Notes",
    bureauVisible: true,
    adminVisible: true,
    greetingPrefix: "Welcome",
  },
};
