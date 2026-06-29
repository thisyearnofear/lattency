// The wordmark's companion glyph: a coffee cup with three wifi arcs rising
// from it. Same shape as `app/icon.svg` (the favicon), kept visually
// consistent so the tab favicon, top-nav, and masthead all read as one
// identity. Scales by a single `size` prop.
//
// Latte + latency = wifi steam.

export function BrandMark({
  size = 28,
  className = "",
  title = "Lattency",
  decorative = false,
}: {
  size?: number;
  className?: string;
  title?: string;
  /** When the mark sits inside a container that already labels itself
   *  (e.g. a link with `aria-label`), set this so the SVG doesn't
   *  re-announce the same name. */
  decorative?: boolean;
}) {
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": title } as const);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      {...a11y}
    >
      {/* Wifi arcs rising from the cup — these read as steam at small size
          and as signal strength at large size. Stroke uses the express
          tier colour so the mark always feels "live". */}
      <path
        d="M9 13.5 Q16 6.5 23 13.5"
        stroke="var(--color-express)"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M12 16 Q16 11.5 20 16"
        stroke="var(--color-express)"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={16} cy={18.5} r={1.4} fill="var(--color-express)" />
      {/* Coffee cup body — gentle trapezoid, rounded bottom corners. */}
      <path
        d="M10 20.5 H22 L21 27.4 Q20.85 28.5 19.7 28.5 H12.3 Q11.15 28.5 11 27.4 Z"
        fill="var(--color-ink)"
      />
      {/* Handle — full D on the right side, tied flush to the body. */}
      <path
        d="M22 22 Q25.6 22 25.6 24.5 Q25.6 27 22 27"
        stroke="var(--color-ink)"
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
