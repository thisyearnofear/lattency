import type { CafeStation } from "@/lib/types";

export function DataSourceNote({ source }: { source: CafeStation["dataSource"] }) {
  const text =
    source === "demo"
      ? "Demo data — sample metrics, not current observations."
      : source === "local"
        ? "Local demo contribution — saved temporarily on this server."
        : source === "community"
          ? "Community-reported measurements — not independently verified."
          : "Measurement source unknown.";
  return (
    <p className="mt-3 border-l-2 border-local pl-3 font-mono text-xs text-ink-soft">
      {text}
    </p>
  );
}
