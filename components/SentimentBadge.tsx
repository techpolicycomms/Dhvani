"use client";

type Props = {
  sentiment: string;
};

const COLORS: Record<string, { bg: string; text: string }> = {
  Positive: { bg: "bg-success/10", text: "text-success" },
  Negative: { bg: "bg-error/10", text: "text-error" },
  Mixed: { bg: "bg-warning/10", text: "text-warning" },
  Neutral: { bg: "bg-mid-gray/10", text: "text-mid-gray" },
};

export default function SentimentBadge({ sentiment }: Props) {
  const style = COLORS[sentiment] || COLORS.Neutral;

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {sentiment}
    </span>
  );
}
