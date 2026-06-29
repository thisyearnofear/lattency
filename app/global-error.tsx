"use client";

// Last-resort boundary — catches errors that crash the root layout
// itself, where the normal error.tsx can't render because its parent
// layout is the thing that broke. Has to render its own <html><body>
// because there's no layout above it.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("[lattency][global-error]", error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#F4ECD8",
          color: "#1A1612",
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 560, textAlign: "center" }}>
          <p
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#5F5750",
            }}
          >
            Out of service
          </p>
          <h1
            style={{
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              fontSize: 64,
              margin: "12px 0",
              lineHeight: 0.95,
            }}
          >
            Whole map down.
          </h1>
          <p style={{ fontStyle: "italic", color: "#5F5750", fontSize: 18, marginTop: 0 }}>
            Lattency hit an error its boundaries couldn&rsquo;t catch.
            Reload to try again; if it keeps happening, something serious is up.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#5F5750",
                marginTop: 24,
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#1A1612",
              color: "#F4ECD8",
              border: 0,
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: 12,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              padding: "12px 20px",
              marginTop: 32,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
