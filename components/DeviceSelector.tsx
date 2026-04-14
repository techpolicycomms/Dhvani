"use client";

import { useAudioDevices } from "@/hooks/useAudioDevices";

type Props = {
  value: string;
  onChange: (deviceId: string) => void;
  className?: string;
};

/**
 * Dropdown of audio input devices. Used in SettingsDrawer and in
 * the setup wizard's virtual-cable flow.
 */
export function DeviceSelector({ value, onChange, className }: Props) {
  const { devices, error, isLoading, refresh } = useAudioDevices();

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-navy border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal"
        >
          <option value="">Default input</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-xs text-teal hover:text-teal-dark px-2 py-2 border border-white/10 rounded"
        >
          {isLoading ? "…" : "Refresh"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
