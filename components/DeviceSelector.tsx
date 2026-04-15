"use client";

import { RotateCw } from "lucide-react";
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
          className="flex-1 bg-white border border-border-gray rounded px-3 py-2 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue"
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
          aria-label="Refresh device list"
          className="inline-flex items-center gap-1 text-xs text-itu-blue-dark hover:text-itu-blue px-2 py-2 border border-border-gray rounded hover:bg-light-gray"
        >
          <RotateCw size={12} className={isLoading ? "animate-spin" : ""} />
          {isLoading ? "" : "Refresh"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
