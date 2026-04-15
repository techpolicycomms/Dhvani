"use client";

import { useCalendarPrefs, type ReminderLead } from "@/hooks/useCalendarPrefs";
import { Switch } from "./Switch";

/**
 * Calendar-integration block for the SettingsDrawer. Exposes the four
 * preferences from useCalendarPrefs as a clean column of toggles plus a
 * lead-time dropdown.
 */
export function CalendarToggle() {
  const { prefs, setPrefs, ready } = useCalendarPrefs();

  // While prefs are rehydrating from localStorage, render with the defaults
  // (the toggles will visually correct on next paint).
  const disabled = !ready;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-dark-navy">
        Calendar Integration
      </h3>

      <ToggleRow
        label="Show calendar meetings"
        checked={prefs.showMeetings}
        disabled={disabled}
        onChange={(v) => setPrefs({ showMeetings: v })}
      />

      <ToggleRow
        label="Meeting reminders"
        checked={prefs.reminders}
        disabled={disabled}
        onChange={(v) => setPrefs({ reminders: v })}
      />

      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="reminder-lead"
          className="text-sm text-dark-navy flex-1"
        >
          Remind me
        </label>
        <select
          id="reminder-lead"
          value={prefs.reminderLead}
          disabled={disabled || !prefs.reminders}
          onChange={(e) =>
            setPrefs({ reminderLead: Number(e.target.value) as ReminderLead })
          }
          className="bg-white border border-border-gray rounded px-2 py-1.5 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue disabled:opacity-50"
        >
          <option value={1}>1 min before</option>
          <option value={2}>2 min before</option>
          <option value={3}>3 min before</option>
          <option value={5}>5 min before</option>
        </select>
      </div>

      <ToggleRow
        label="Auto-tag transcripts"
        checked={prefs.autoTag}
        disabled={disabled}
        onChange={(v) => setPrefs({ autoTag: v })}
      />
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-dark-navy flex-1">{label}</span>
      <Switch
        checked={checked}
        onChange={onChange}
        label={label}
        disabled={disabled}
      />
    </div>
  );
}
