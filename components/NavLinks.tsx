"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, FileText, Shield, Upload } from "lucide-react";

type Props = {
  /** Whether to render the Admin link (probed by the parent). */
  isAdmin?: boolean;
  /** Variant: header strip vs vertical (settings drawer). */
  orientation?: "horizontal" | "vertical";
};

/**
 * Top-level navigation: Home (today's calendar), Transcripts (history),
 * and (optionally) Admin. Renders lucide icons + label, with active state
 * coloured ITU Blue.
 */
export function NavLinks({ isAdmin, orientation = "horizontal" }: Props) {
  const pathname = usePathname();

  const items = [
    { href: "/", label: "Home", icon: Calendar },
    { href: "/transcripts", label: "Transcripts", icon: FileText },
    { href: "/upload", label: "Upload", icon: Upload },
  ];
  if (isAdmin) {
    items.push({ href: "/admin", label: "Admin", icon: Shield });
  }

  const containerCls =
    orientation === "horizontal"
      ? "flex items-center gap-1"
      : "flex flex-col gap-1";

  return (
    <nav className={containerCls} aria-label="Primary">
      {items.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium",
              "transition-colors",
              isActive
                ? "bg-itu-blue-pale text-itu-blue"
                : "text-mid-gray hover:text-dark-navy hover:bg-light-gray",
            ].join(" ")}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={14} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
