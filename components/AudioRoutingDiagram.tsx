type Props = {
  platform: "mac" | "windows";
  className?: string;
};

const ITU_BLUE = "#009CD6";
const DARK_NAVY = "#003366";
const MID_GRAY = "#6B7280";
const BORDER_GRAY = "#E5E7EB";
const ITU_BLUE_PALE = "#E5F4FB";
const WARNING = "#D97706";
const WARNING_PALE = "#FEF3C7";

/**
 * SVG diagram showing the audio flow through a virtual cable.
 *
 *   Meeting App → System Audio → Virtual Cable ──→ Dhvani (transcription)
 *                                              └──→ Your Speakers
 */
export function AudioRoutingDiagram({ platform, className }: Props) {
  const cable = platform === "mac" ? "BlackHole 2ch" : "CABLE Output";
  return (
    <svg
      viewBox="0 0 760 260"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={`Audio routing diagram for ${platform}`}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={ITU_BLUE} />
        </marker>
      </defs>

      {/* Boxes */}
      <Box x={10} y={100} w={150} h={60} label="Meeting App" sub="Zoom / Teams" />
      <Box x={200} y={100} w={150} h={60} label="System Audio" sub="OS mixer" />
      <Box x={390} y={100} w={150} h={60} label="Virtual Cable" sub={cable} highlight />
      <Box x={580} y={20} w={170} h={60} label="Dhvani" sub="Transcribes" primary />
      <Box x={580} y={180} w={170} h={60} label="Your Speakers" sub="You still hear" />

      {/* Arrows */}
      <Arrow x1={160} y1={130} x2={200} y2={130} />
      <Arrow x1={350} y1={130} x2={390} y2={130} />
      {/* Split from virtual cable to both outputs */}
      <path
        d="M 540 130 L 560 130 L 560 50 L 580 50"
        fill="none"
        stroke={ITU_BLUE}
        strokeWidth="2"
        markerEnd="url(#arrow)"
      />
      <path
        d="M 540 130 L 560 130 L 560 210 L 580 210"
        fill="none"
        stroke={ITU_BLUE}
        strokeWidth="2"
        markerEnd="url(#arrow)"
      />
    </svg>
  );
}

function Box({
  x,
  y,
  w,
  h,
  label,
  sub,
  primary,
  highlight,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  primary?: boolean;
  highlight?: boolean;
}) {
  const stroke = primary ? ITU_BLUE : highlight ? WARNING : BORDER_GRAY;
  const fill = primary ? ITU_BLUE_PALE : highlight ? WARNING_PALE : "#FFFFFF";
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        ry={10}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
      <text
        x={x + w / 2}
        y={y + 25}
        textAnchor="middle"
        fill={DARK_NAVY}
        fontFamily="Noto Sans, sans-serif"
        fontSize="14"
        fontWeight="600"
      >
        {label}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + 45}
          textAnchor="middle"
          fill={MID_GRAY}
          fontFamily="Noto Sans, sans-serif"
          fontSize="11"
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={ITU_BLUE}
      strokeWidth={2}
      markerEnd="url(#arrow)"
    />
  );
}
