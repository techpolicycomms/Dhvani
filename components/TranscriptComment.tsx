"use client";

import { useCallback, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

export type Comment = {
  id: string;
  entryId: string;
  userName: string;
  text: string;
  timestamp: string;
};

type Props = {
  entryId: string;
  comments: Comment[];
  onAdd: (entryId: string, text: string) => void;
  onDelete?: (commentId: string) => void;
};

export default function TranscriptComment({ entryId, comments, onAdd, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const submit = useCallback(() => {
    if (!text.trim()) return;
    onAdd(entryId, text.trim());
    setText("");
  }, [entryId, text, onAdd]);

  const entryComments = comments.filter((c) => c.entryId === entryId);

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className={`p-1 rounded transition-colors ${
          entryComments.length > 0
            ? "text-itu-blue hover:text-itu-blue-dark"
            : "text-mid-gray/40 hover:text-mid-gray"
        }`}
        title={entryComments.length > 0 ? `${entryComments.length} comment(s)` : "Add comment"}
      >
        <MessageCircle size={14} />
        {entryComments.length > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-itu-blue text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {entryComments.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-20 mt-1 w-72 bg-white border border-border-gray rounded-lg shadow-lg overflow-hidden">
          {entryComments.length > 0 && (
            <div className="max-h-40 overflow-y-auto divide-y divide-border-gray">
              {entryComments.map((c) => (
                <div key={c.id} className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-dark-navy">{c.userName}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-mid-gray">
                        {new Date(c.timestamp).toLocaleTimeString(undefined, { timeStyle: "short" })}
                      </span>
                      {onDelete && (
                        <button onClick={() => onDelete(c.id)} className="p-0.5 text-mid-gray hover:text-error">
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-dark-gray mt-0.5">{c.text}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex border-t border-border-gray">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2 text-xs text-dark-navy placeholder-mid-gray focus:outline-none"
              autoFocus
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="px-2 text-itu-blue hover:text-itu-blue-dark disabled:opacity-30"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
