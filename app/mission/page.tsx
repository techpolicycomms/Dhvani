"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";
import { NavLinks } from "@/components/NavLinks";
import { MissionControl } from "@/components/MissionControl";

export default function MissionPage() {
  return (
    <main className="min-h-screen bg-off-white">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-gray bg-white">
        <Link href="/" className="flex items-baseline gap-2 text-lg font-bold text-dark-navy">
          Dhvani <span className="text-mid-gray text-sm font-normal">ध्वनि</span>
        </Link>
        <NavLinks />
      </header>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-xl bg-itu-blue-pale flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Rocket size={22} className="text-itu-blue-dark" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark-navy">
              Mission Control
            </h1>
            <p className="text-sm text-mid-gray mt-1">
              Your personal dashboard. Every meeting transcribed, every
              action item closed, every summary generated — tracked.
            </p>
          </div>
        </div>
        <MissionControl />
      </section>
    </main>
  );
}
