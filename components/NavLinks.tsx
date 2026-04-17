"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Download,
  FileText,
  Laptop,
  Shield,
  Upload,
} from "lucide-react";

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

  // Demo mode shows Admin to everyone — the /admin pages gate access
  // server-side in production. This just controls the nav affordance.
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  const items: Array<{
    href: string;
    label: string;
    icon: typeof Calendar;
  }> = [
    { href: "/", label: "Home", icon: Calendar },
    { href: "/transcripts", label: "Transcripts", icon: FileText },
    { href: "/upload", label: "Upload", icon: Upload },
    { href: "/desktop-setup", label: "Desktop Setup", icon: Laptop },
  ];
  if (isAdmin || demoMode) {
    items.push({ href: "/admin", label: "Admin", icon: Shield });
  }
  items.push({ href: "/download", label: "Download", icon: Download });

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
