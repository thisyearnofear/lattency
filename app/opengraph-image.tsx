import { ImageResponse } from "next/og";

export const alt = "Lattency — a metro map of the city's wifi, brewed in Nairobi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Render the social card on-demand rather than at build time. The Turbopack
// build-time prerender of next/og currently throws ("reading 'trim'"); deferring
// to the runtime (where next/og works) keeps `next build` — and the Vercel
// deploy — green while still serving the image.
export const dynamic = "force-dynamic";

export default function OpenGraphImage() {
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
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Edition bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            letterSpacing: "6px",
            textTransform: "uppercase",
            color: "#3D362B",
          }}
        >
          <span>Edition 01 · 2026 · Vol I</span>
          <span>
            Nairobi · Live from{" "}
            <span style={{ color: "#006D45" }}>PG_DB</span>
          </span>
        </div>

        {/* Top hairline */}
        <div style={{ height: 3, background: "#1A1612", margin: "20px 0" }} />

        {/* Title block */}
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
              fontSize: 200,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-8px",
              lineHeight: 0.82,
              color: "#1A1612",
            }}
          >
            Lattency
          </div>
          <div
            style={{
              fontSize: 40,
              fontStyle: "italic",
              color: "#3D362B",
              marginTop: 12,
            }}
          >
            {"a metro map of the city\u2019s wifi · brewed in nairobi"}
          </div>
          <div
            style={{
              fontSize: 24,
              color: "#8A7F6B",
              marginTop: 28,
              maxWidth: 760,
              lineHeight: 1.4,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {"Twelve cafés. Three lines. Speed measurements crowdsourced from anyone with a connection — turned into the only metro map of Nairobi where the stations don\u2019t move but the lines do."}
          </div>
        </div>

        {/* Bottom hairline */}
        <div style={{ height: 3, background: "#1A1612", margin: "0 0 24px" }} />

        {/* Three transit lines */}
        <div style={{ display: "flex", gap: 56, alignItems: "center" }}>
          <Line color="#006D45" letter="X" label="EXPRESS" threshold="≥ 50 Mbps" />
          <Line color="#C77F00" letter="L" label="LOCAL" threshold="10–49 Mbps" />
          <Line
            color="#B23A48"
            letter="S"
            label="SUSPENDED"
            threshold="< 10 Mbps"
            dashed
          />
        </div>
      </div>
    ),
    { ...size }
  );
}

function Line({
  color,
  letter,
  label,
  threshold,
  dashed,
}: {
  color: string;
  letter: string;
  label: string;
  threshold: string;
  dashed?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          background: color,
          color: "#F4ECD8",
          fontSize: 36,
          fontWeight: 900,
          width: 56,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {letter}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            ...(dashed
              ? { height: 8, borderBottom: `8px dashed ${color}` }
              : { width: 180, height: 8, background: color }),
          }}
        />
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "2px",
            marginTop: 8,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 16, color: "#8A7F6B", marginTop: 2 }}>
          {threshold}
        </div>
      </div>
    </div>
  );
}
