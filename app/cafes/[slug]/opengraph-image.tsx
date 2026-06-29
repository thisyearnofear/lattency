import { ImageResponse } from "next/og";
import { getCafeBySlug } from "@/lib/cafes";
import { assessStability, STABILITY_COLOUR_HEX } from "@/lib/stability";
import type { Tier } from "@/lib/types";

export const alt = "Lattency café profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const TIER_COLOUR: Record<Tier, string> = {
  express: "#006D45",
  local: "#C77F00",
  suspended: "#B23A48",
};

export default async function CafeOGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cafe = await getCafeBySlug(slug);
  if (!cafe) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", background: "#F4ECD8", color: "#1A1612", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
          <span style={{ fontSize: 72, fontWeight: 900 }}>Not found</span>
        </div>
      ),
      { ...size },
    );
  }

  const tierColour = TIER_COLOUR[cafe.tier];
  const down = Math.round(cafe.medianDownMbps);
  const up = cafe.medianUpMbps.toFixed(1);
  const ping = Math.round(cafe.medianLatencyMs);
  const { stability, hasData, label: stabilityLabel } = assessStability(cafe.medianJitterMs, cafe.medianLossPct);
  const stabilityColour = STABILITY_COLOUR_HEX[stability];
  const signalValue = hasData ? stabilityLabel.toUpperCase() : "—";
  const signalUnit = hasData ? `${cafe.medianJitterMs.toFixed(1)}ms` : "no data";
  const signalColour = hasData ? stabilityColour : "#8A7F6B";
  const tierLetter = cafe.tier[0].toUpperCase();
  const tierText = `${cafe.tier.toUpperCase()} · ${cafe.tier === "express" ? "≥ 50 Mbps" : cafe.tier === "local" ? "10–49 Mbps" : "< 10 Mbps"}`;
  const vibe = cafe.vibe || "Café wifi speeds, crowdsourced from anyone with a connection.";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#F4ECD8", color: "#1A1612", display: "flex", flexDirection: "column", padding: 56, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 18, letterSpacing: "5px", textTransform: "uppercase", color: "#3D362B" }}>
          <span>Lattency · Café Profile</span>
          <span>{cafe.neighbourhood}</span>
        </div>
        <div style={{ height: 3, background: "#1A1612", marginTop: 16, marginBottom: 16 }} />
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ background: tierColour, color: "#F4ECD8", fontSize: 32, fontWeight: 900, width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span>{tierLetter}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
            <span style={{ fontSize: 64, fontWeight: 900, textTransform: "uppercase", lineHeight: 0.9, color: "#1A1612" }}>
              {cafe.name}
            </span>
            <span style={{ fontSize: 20, color: "#8A7F6B", marginTop: 6, letterSpacing: "1px", textTransform: "uppercase" }}>
              {tierText}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 36 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, letterSpacing: "3px", color: "#8A7F6B" }}>DOWN</span>
            <span style={{ fontSize: 52, fontWeight: 900, color: tierColour, lineHeight: 1, marginTop: 6 }}>{down}</span>
            <span style={{ fontSize: 16, color: "#8A7F6B", marginTop: 2 }}>Mbps</span>
          </div>
          <div style={{ width: 1, background: "#D4C9B0", marginTop: 4, marginBottom: 4, marginLeft: 24, marginRight: 24 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, letterSpacing: "3px", color: "#8A7F6B" }}>UP</span>
            <span style={{ fontSize: 52, fontWeight: 900, color: "#3D362B", lineHeight: 1, marginTop: 6 }}>{up}</span>
            <span style={{ fontSize: 16, color: "#8A7F6B", marginTop: 2 }}>Mbps</span>
          </div>
          <div style={{ width: 1, background: "#D4C9B0", marginTop: 4, marginBottom: 4, marginLeft: 24, marginRight: 24 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, letterSpacing: "3px", color: "#8A7F6B" }}>PING</span>
            <span style={{ fontSize: 52, fontWeight: 900, color: "#3D362B", lineHeight: 1, marginTop: 6 }}>{ping}</span>
            <span style={{ fontSize: 16, color: "#8A7F6B", marginTop: 2 }}>ms</span>
          </div>
          <div style={{ width: 1, background: "#D4C9B0", marginTop: 4, marginBottom: 4, marginLeft: 24, marginRight: 24 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, letterSpacing: "3px", color: "#8A7F6B" }}>SIGNAL</span>
            <span style={{ fontSize: 52, fontWeight: 900, color: signalColour, lineHeight: 1, marginTop: 6 }}>{signalValue}</span>
            <span style={{ fontSize: 16, color: "#8A7F6B", marginTop: 2 }}>{signalUnit}</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flex: 1, marginTop: 24 }}>
          <span style={{ fontSize: 26, fontStyle: "italic", color: "#3D362B", maxWidth: 700, lineHeight: 1.3 }}>
            {vibe}
          </span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: "#1A1612", lineHeight: 1 }}>{cafe.measurementCount}</span>
            <span style={{ fontSize: 14, color: "#8A7F6B", letterSpacing: "2px", textTransform: "uppercase", marginTop: 4 }}>measurements</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, letterSpacing: "4px", textTransform: "uppercase", color: "#8A7F6B", borderTop: "1px solid #D4C9B0", paddingTop: 16 }}>
          <span>lattency.vercel.app/cafes/{slug}</span>
          <span>Live from PG_DB</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
