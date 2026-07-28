import { ImageResponse } from "next/og";

// Apple touch icon — 180×180 PNG, rendered on-demand via ImageResponse.
// Mirrors the SVG favicon's coffee-cup + wifi-arc motif. iOS uses this for
// "Add to Home Screen"; without it, iOS shows a generic screenshot.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#F4ECD8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wifi arcs — two stacked arcs in express green */}
        <div
          style={{
            width: 80,
            height: 40,
            borderTop: "5px solid #006D45",
            borderRadius: "50%",
            borderBottom: "none",
            borderLeft: "none",
            borderRight: "none",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        />
        <div
          style={{
            width: 50,
            height: 25,
            borderTop: "4px solid #006D45",
            borderRadius: "50%",
            borderBottom: "none",
            borderLeft: "none",
            borderRight: "none",
            marginTop: -2,
          }}
        />
        {/* Signal dot */}
        <div
          style={{
            width: 8,
            height: 8,
            background: "#006D45",
            borderRadius: "50%",
            marginTop: 2,
          }}
        />
        {/* Coffee cup body */}
        <div
          style={{
            width: 56,
            height: 36,
            background: "#1A1612",
            borderRadius: "0 0 8px 8px",
            marginTop: 8,
            display: "flex",
            alignItems: "center",
          }}
        >
          {/* Handle */}
          <div
            style={{
              width: 14,
              height: 18,
              border: "4px solid #1A1612",
              borderRadius: "50%",
              background: "#F4ECD8",
              marginLeft: 52,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
