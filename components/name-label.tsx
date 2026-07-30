import { splitName } from "@/lib/map-data";

// Station name under a roundel, split onto 1–2 caps lines. Shared by the
// schematic map layer (map-shell) and the cinematic tour (cinematic-map).
export function NameLabel({
  name,
  x,
  y,
  className,
}: {
  name: string;
  x: number;
  y: number;
  className?: string;
}) {
  const [line1, line2] = splitName(name);
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontFamily="var(--font-display)"
      fontWeight={800}
      fontSize={13}
      letterSpacing="0.04em"
      fill="var(--color-ink)"
      className={className}
      style={{ pointerEvents: "none" }}
    >
      <tspan x={x}>{line1}</tspan>
      {line2 && (
        <tspan x={x} dy={14}>
          {line2}
        </tspan>
      )}
    </text>
  );
}
