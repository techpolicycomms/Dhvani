/**
 * Meeting wellness monitor — flags weeks where total meeting hours
 * are approaching burnout thresholds.
 *
 * Values default to the widely-cited 15/20/25 hour bands. Users can
 * override via environment or future Settings UI.
 */

export type WellnessConfig = {
  healthyMeetingHours: number;
  warningMeetingHours: number;
  criticalMeetingHours: number;
  maxConsecutiveHours: number;
  longMeetingMinutes: number;
};

export const DEFAULT_WELLNESS_CONFIG: WellnessConfig = {
  healthyMeetingHours: 15,
  warningMeetingHours: 20,
  criticalMeetingHours: 25,
  maxConsecutiveHours: 3,
  longMeetingMinutes: 90,
};

export type WellnessLevel = "healthy" | "caution" | "warning" | "critical";

export type WellnessReport = {
  level: WellnessLevel;
  weeklyHours: number;
  weeklyMeetings: number;
  todayHours: number;
  todayMeetings: number;
  consecutiveHoursToday: number;
  statusMessage: string;
  recommendation: string;
  orbitStatus: string;
  signalStrength: number; // 0-100
  config: WellnessConfig;
};

export function assessWellness(
  weekly: { hours: number; count: number },
  today: { hours: number; count: number; consecutiveHours: number },
  config: WellnessConfig = DEFAULT_WELLNESS_CONFIG
): WellnessReport {
  let level: WellnessLevel = "healthy";
  let orbitStatus = "🟢 Stable LEO — All systems nominal";
  let signalStrength = 100;
  let statusMessage = "You're in a healthy meeting rhythm.";
  let recommendation =
    "Keep it up — your constellation is well-maintained.";

  if (weekly.hours >= config.criticalMeetingHours) {
    level = "critical";
    orbitStatus = "🔴 Re-entry imminent — Orbit critically low";
    signalStrength = 15;
    statusMessage = `${weekly.hours.toFixed(1)}h of meetings this week — significantly above the healthy threshold.`;
    recommendation =
      "Consider declining non-essential meetings and blocking focus time. Your signal is fading.";
  } else if (weekly.hours >= config.warningMeetingHours) {
    level = "warning";
    orbitStatus = "🟠 Orbit decaying — Boost required";
    signalStrength = 40;
    statusMessage = `${weekly.hours.toFixed(1)}h this week — approaching the interference zone.`;
    recommendation =
      "Try to protect tomorrow morning for deep work. Your orbit is drifting.";
  } else if (weekly.hours >= config.healthyMeetingHours) {
    level = "caution";
    orbitStatus = "🟡 LEO drift detected — Monitor closely";
    signalStrength = 65;
    statusMessage = `${weekly.hours.toFixed(1)}h this week — within range but trending high.`;
    recommendation =
      "Consider whether all remaining meetings this week need your attendance.";
  }

  if (today.consecutiveHours >= config.maxConsecutiveHours) {
    recommendation +=
      ` ⚠️ You've been in back-to-back meetings for ${today.consecutiveHours.toFixed(1)}h today — even astronauts rest between EVAs.`;
  }

  return {
    level,
    weeklyHours: weekly.hours,
    weeklyMeetings: weekly.count,
    todayHours: today.hours,
    todayMeetings: today.count,
    consecutiveHoursToday: today.consecutiveHours,
    statusMessage,
    recommendation,
    orbitStatus,
    signalStrength,
    config,
  };
}
