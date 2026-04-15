"use client";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
};

/**
 * Two-state switch matching the ITU brand. 40×20 track, ITU Blue when on,
 * border-gray when off. Exposes a hidden checkbox for keyboard + a11y.
 */
export function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <label
      className={[
        "inline-flex items-center gap-2 cursor-pointer select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <span className="sr-only">{label || (checked ? "On" : "Off")}</span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={[
          "relative inline-block w-10 h-5 rounded-full transition-colors duration-200",
          checked ? "bg-itu-blue" : "bg-border-gray",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow",
            "transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </span>
    </label>
  );
}
