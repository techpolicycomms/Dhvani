"use client";

import Link from "next/link";
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-dark-navy">Tasks ✅</h1>
          <p className="text-sm text-mid-gray mt-1">
            Tasks extracted from meeting summaries, plus anything you add
            manually. Tick them off as you coordinate each frequency.
          </p>
        </div>
        <TaskChecklist />
      </section>
    </main>
  );
}
