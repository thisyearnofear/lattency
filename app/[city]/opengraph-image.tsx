import { ImageResponse } from "next/og";
import { getCafes } from "@/lib/cafes";
import { resolveCityConfig } from "@/lib/cities";
import type { Tier } from "@/lib/types";

export const alt = "Lattency — city wifi map";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

const TIER_COLOUR: Record<Tier, string> = {
  express: "#006D45",
  local: "#C77F00",
  suspended: "#B23A48",
};
const TIER_LABEL: Record<Tier, string> = {
  express: "EXPRESS · ≥ 50 Mbps",
  local: "LOCAL · 10–49 Mbps",
  suspended: "SUSPENDED · < 10 Mbps",
};

export default async function CityOGImage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const allCafes = await getCafes({ all: true });
  const config = resolveCityConfig(city, allCafes);
  const cafes = await getCafes({ city });
  const tierCounts: Record<Tier, number> = { express: 0, local: 0, suspended: 0 };
  for (const c of cafes) tierCounts[c.tier]++;
  const total = cafes.length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#F4ECD8",
          color: "#1A1612",
          display: "flex",
          flexDirection: "column",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Edition bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 20,
            letterSpacing: "5px",
            textTransform: "uppercase",
            color: "#3D362B",
          }}
        >
          <span>Lattency · Metro Map</span>
          <span>{config.country || "Global Network"}</span>
        </div>

        {/* Top hairline */}
        <div style={{ height: 3, background: "#1A1612", margin: "18px 0" }} />

        {/* City name + tagline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 160,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-6px",
              lineHeight: 0.82,
              color: "#1A1612",
            }}
          >
            {config.name}
          </div>
          <div
            style={{
              fontSize: 36,
              fontStyle: "italic",
              color: "#3D362B",
              marginTop: 10,
            }}
          >
            {"Where can you work today?"}
          </div>
          <div
            style={{
              fontSize: 22,
              color: "#8A7F6B",
              marginTop: 20,
              maxWidth: 720,
              lineHeight: 1.4,
            }}
          >
            {`${total} ${total === 1 ? "station" : "stations"} mapped · verified wifi speeds for cafés and coworking spots, charted like a transit network.`}
          </div>
        </div>

        {/* Bottom hairline */}
        <div style={{ height: 3, background: "#1A1612", margin: "0 0 20px" }} />

        {/* Tier breakdown */}
        <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
          {(["express", "local", "suspended"] as const).map((tier) => {
            const count = tierCounts[tier];
            if (count === 0) return null;
            return (
              <div
                key={tier}
                style={{ display: "flex", alignItems: "center", gap: 14 }}
              >
                <div
                  style={{
                    background: TIER_COLOUR[tier],
                    color: "#F4ECD8",
                    fontSize: 32,
                    fontWeight: 900,
                    width: 48,
                    height: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {tier[0].toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: 36,
                      fontWeight: 900,
                      color: TIER_COLOUR[tier],
                      lineHeight: 1,
                    }}
                  >
                    {count}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: "#8A7F6B",
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      marginTop: 4,
                    }}
                  >
                    {TIER_LABEL[tier]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ),
    { ...size },
  );
}
