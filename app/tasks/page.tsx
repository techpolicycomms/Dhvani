"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { NavLinks } from "@/components/NavLinks";
import { TaskChecklist } from "@/components/TaskChecklist";

export default function TasksPage() {
  return (
    <main className="min-h-screen bg-off-white">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-gray bg-white">
        <Link href="/" className="flex items-baseline gap-2 text-lg font-bold text-dark-navy">
          Dhvani <span className="text-mid-gray text-sm font-normal">ध्वनि</span>
        </Link>
        <NavLinks />
      </header>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-xl bg-itu-blue-pale flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <ListChecks size={22} className="text-itu-blue-dark" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark-navy">Tasks</h1>
            <p className="text-sm text-mid-gray mt-1">
              Action items extracted from meeting summaries, plus anything
              you add manually. Tick them off as you close the loop.
            </p>
          </div>
        </div>
        <TaskChecklist />
      </section>
    </main>
  );
}
