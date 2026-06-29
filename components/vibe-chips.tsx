// Single source of truth for the small vibe-chip row that sits under the
// neighbourhood / one-line vibe across StationCard, CafeDetail drawer, and
// CafePage. Lowercase mono — same family as every other label on the page.
//
// `dense` shrinks padding/leading for the card layout; the drawer and the
// detail page use the default size.

export function VibeChips({
  tags,
  dense = false,
}: {
  tags?: string[];
  dense?: boolean;
}) {
  if (!tags || tags.length === 0) return null;
  const size = dense
    ? "text-[9px] tracking-[0.14em] px-1.5 py-[2px]"
    : "text-[10px] tracking-[0.16em] px-2 py-[3px]";
  return (
    <ul
      aria-label="Vibe tags"
      className="flex flex-wrap items-center gap-1.5"
    >
      {tags.map((t) => (
        <li
          key={t}
          className={`font-mono ${size} uppercase border border-ink/25 text-ink-soft bg-cream-edge/60`}
        >
          {t}
        </li>
      ))}
    </ul>
  );
}
