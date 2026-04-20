"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, Loader2, MessageCircle, Send, X } from "lucide-react";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";

type Citation = {
  meetingTitle: string;
  date: string;
  speaker: string;
  quote: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

type Props = {
  transcriptIds?: string[];
  scope?: "single" | "all";
};

const SUGGESTIONS = [
  "What action items are assigned to me?",
  "Summarize last week's meetings",
  "What were the key decisions?",
  "What were the key disagreements?",
];

export default function AskDhvani({ transcriptIds, scope = "all" }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || loading) return;
      const userMsg: Message = { role: "user", content: question.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            question: question.trim(),
            transcriptIds,
            scope,
            history: messages.slice(-10),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Request failed");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: body.answer, citations: body.citations },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${(err as Error).message}` },
        ]);
      } finally {
        setLoading(false);
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 50);
      }
    },
    [loading, messages, transcriptIds, scope]
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-itu-blue rounded-lg hover:bg-itu-blue-dark transition-colors"
      >
        <MessageCircle size={16} />
        Ask Dhvani
      </button>
    );
  }

  return (
    <div className="border border-border-gray rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-gray bg-off-white">
        <div className="flex items-center gap-2 text-sm font-semibold text-dark-navy">
          <MessageCircle size={16} className="text-itu-blue" />
          Ask Dhvani
        </div>
        <button onClick={() => setOpen(false)} className="p-1 rounded text-mid-gray hover:text-dark-navy">
          <X size={14} />
        </button>
      </div>

      <div ref={scrollRef} className="h-72 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center pt-4">
            <p className="text-sm text-mid-gray mb-4">
              Ask questions about your meeting transcripts
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-itu-blue/30 text-itu-blue hover:bg-itu-blue-pale transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-itu-blue text-white"
                  : "bg-light-gray text-dark-navy"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border-gray/50 space-y-1">
                  {msg.citations.map((c, j) => (
                    <div key={j} className="text-xs text-mid-gray">
                      {c.meetingTitle} ({c.date}){c.speaker ? ` — ${c.speaker}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-light-gray rounded-lg px-3 py-2">
              <Loader2 size={16} className="animate-spin text-itu-blue" />
            </div>
          </div>
        )}
      </div>

      <div
        role="note"
        className="flex items-start gap-2 px-3 py-2 border-t border-border-gray bg-off-white text-[11px] leading-snug text-mid-gray"
      >
        <AlertCircle size={12} className="shrink-0 mt-0.5 text-warning" aria-hidden />
        <span>AI answers are derived from your transcripts. {DISCLAIMER_SHORT}</span>
      </div>

      <div className="border-t border-border-gray p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your meetings..."
            className="flex-1 px-3 py-2 text-sm border border-border-gray rounded-lg focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue text-dark-navy placeholder-mid-gray"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-3 py-2 bg-itu-blue text-white rounded-lg hover:bg-itu-blue-dark disabled:opacity-50 transition-colors"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
