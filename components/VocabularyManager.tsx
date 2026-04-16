"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";

type VocabEntry = {
  id: string;
  term: string;
  definition: string;
};

const SUGGESTIONS = [
  "ITU-R", "ITU-T", "ITU-D", "WTSA", "WRC",
  "Radiocommunication", "Plenipotentiary", "WSIS",
  "spectrum allocation", "IMT-2030",
];

export default function VocabularyManager() {
  const [terms, setTerms] = useState<VocabEntry[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vocabulary", { credentials: "include" })
      .then((r) => r.json())
      .then((b) => setTerms(b.terms || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addTerm = useCallback(async (term: string) => {
    if (!term.trim()) return;
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ term: term.trim() }),
      });
      if (!res.ok) return;
      const body = await res.json();
      setTerms((prev) => [...prev, body.term]);
      setNewTerm("");
    } catch { /* ignore */ }
  }, []);

  const deleteTerm = useCallback(async (id: string) => {
    try {
      await fetch(`/api/vocabulary?id=${id}`, { method: "DELETE", credentials: "include" });
      setTerms((prev) => prev.filter((t) => t.id !== id));
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-dark-navy">
        <BookOpen size={16} className="text-itu-blue" />
        Custom Vocabulary
      </div>
      <p className="text-xs text-mid-gray">
        Add domain-specific terms to improve transcription accuracy.
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTerm(newTerm)}
          placeholder="Add a term..."
          className="flex-1 px-3 py-2 text-sm border border-border-gray rounded-lg text-dark-navy placeholder-mid-gray focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
        />
        <button
          onClick={() => addTerm(newTerm)}
          disabled={!newTerm.trim()}
          className="px-3 py-2 bg-itu-blue text-white rounded-lg hover:bg-itu-blue-dark disabled:opacity-50 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-mid-gray">Loading...</div>
      ) : (
        <>
          {terms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {terms.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-itu-blue-pale text-itu-blue-dark font-medium"
                >
                  {t.term}
                  <button
                    onClick={() => deleteTerm(t.id)}
                    className="text-itu-blue hover:text-error transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {terms.length === 0 && (
            <div className="text-xs text-mid-gray">
              <p className="mb-2">Suggested ITU terms:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.filter((s) => !terms.some((t) => t.term === s)).map((s) => (
                  <button
                    key={s}
                    onClick={() => addTerm(s)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-border-gray text-mid-gray hover:border-itu-blue hover:text-itu-blue transition-colors"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
