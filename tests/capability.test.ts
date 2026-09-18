import { describe, it, expect } from "vitest";
import {
  CALL_REQUIREMENTS,
  callCaveat,
  capabilities,
  tierOverstatesCall,
  videoCallReadiness,
  type StationMetrics,
} from "@/lib/capability";

/** A comfortably call-ready connection, to be degraded per test. */
function metrics(overrides: Partial<StationMetrics> = {}): StationMetrics {
  return {
    downMbps: 100,
    upMbps: 40,
    latencyMs: 20,
    lossPct: 0,
    samples: 5,
    ...overrides,
  };
}

describe("videoCallReadiness", () => {
  it("says yes with room to spare on a strong symmetric line", () => {
    const result = videoCallReadiness(metrics());
    expect(result.verdict).toBe("yes");
    expect(result.bottleneck).toBeNull();
  });

  it("says unknown when nothing has been measured", () => {
    const result = videoCallReadiness(metrics({ samples: 0 }));
    expect(result.verdict).toBe("unknown");
    expect(result.bottleneck).toBeNull();
  });

  it("blames upload when a fast download hides a weak uplink", () => {
    // The case this module exists for: 200 Mbps down reads as "Express" and
    // carries the "video calls OK" badge, but 1 Mbps up cannot hold a call.
    const result = videoCallReadiness(metrics({ downMbps: 200, upMbps: 1 }));

    expect(result.verdict).toBe("no");
    expect(result.bottleneck).toBe("upload");
    expect(result.note).toMatch(/Upload 1 Mbps/);
  });

  it("blames download when the uplink is fine but the downlink is not", () => {
    const result = videoCallReadiness(metrics({ downMbps: 1.5, upMbps: 40 }));

    expect(result.verdict).toBe("no");
    expect(result.bottleneck).toBe("download");
  });

  it("blames latency when throughput is ample but the path is slow", () => {
    const result = videoCallReadiness(metrics({ latencyMs: 400 }));

    expect(result.verdict).toBe("no");
    expect(result.bottleneck).toBe("latency");
    expect(result.note).toMatch(/400 ms/);
  });

  it("blames packet loss when it would break audio", () => {
    const result = videoCallReadiness(metrics({ lossPct: 8 }));

    expect(result.verdict).toBe("no");
    expect(result.bottleneck).toBe("packet loss");
  });

  it("reports the true limiting metric, not the first one that fails", () => {
    // Download clears its floor comfortably; upload is the real constraint.
    // A checklist implementation would most likely blame whichever it tested
    // first, so this pins the intended behaviour: smallest headroom wins.
    const result = videoCallReadiness(
      metrics({ downMbps: 60, upMbps: 3.1, latencyMs: 30 }),
    );

    expect(result.bottleneck).toBe("upload");
  });

  it("treats a zero latency reading as unrecorded rather than perfect", () => {
    // Manual entries carry no latency figure. Reading 0 as instant would hand
    // out a free pass on the metric most likely to spoil a call.
    const withZero = videoCallReadiness(metrics({ latencyMs: 0 }));
    const withFast = videoCallReadiness(metrics({ latencyMs: 1 }));

    expect(withZero.bottleneck).not.toBe("latency");
    expect(withFast.verdict).toBe("yes");
  });

  it("treats zero packet loss as no evidence of a problem", () => {
    // 0 means either "measured fine" or "never measured" — it can only fail to
    // downgrade, never itself cause a downgrade.
    expect(videoCallReadiness(metrics({ lossPct: 0 })).verdict).toBe("yes");
  });

  it("calls a line that only just clears the bar marginal", () => {
    const result = videoCallReadiness(
      metrics({
        downMbps: CALL_REQUIREMENTS.downMbps,
        upMbps: CALL_REQUIREMENTS.upMbps,
        latencyMs: CALL_REQUIREMENTS.latencyMs,
      }),
    );

    expect(result.verdict).toBe("marginal");
    expect(result.bottleneck).not.toBeNull();
  });
});

describe("capabilities", () => {
  it("returns the three capability verdicts", () => {
    const caps = capabilities(metrics());
    expect(caps.map((c) => c.id)).toEqual([
      "video-calls",
      "uploading",
      "large-downloads",
    ]);
    expect(caps.every((c) => c.verdict === "yes")).toBe(true);
  });

  it("marks every capability unknown without readings", () => {
    const caps = capabilities(metrics({ samples: 0 }));
    expect(caps.every((c) => c.verdict === "unknown")).toBe(true);
  });

  it("grades upload speed separately from download speed", () => {
    const caps = capabilities(metrics({ downMbps: 300, upMbps: 2 }));
    const byId = Object.fromEntries(caps.map((c) => [c.id, c.verdict]));

    expect(byId["large-downloads"]).toBe("yes");
    expect(byId["video-calls"]).toBe("no");
    expect(byId["uploading"]).toBe("no");
  });

  it("never leaves a note empty, so the UI always has something to say", () => {
    for (const sample of [metrics(), metrics({ samples: 0 }), metrics({ upMbps: 1 })]) {
      for (const cap of capabilities(sample)) {
        expect(cap.note.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("tierOverstatesCall", () => {
  it("flags an Express station that cannot hold a call", () => {
    expect(tierOverstatesCall(metrics({ downMbps: 200, upMbps: 1 }))).toBe(true);
  });

  it("does not flag an Express station that can", () => {
    expect(tierOverstatesCall(metrics({ downMbps: 200, upMbps: 40 }))).toBe(false);
  });

  it("does not pile on for a station already on the suspended line", () => {
    // A suspended café is obviously poor; repeating that as a caveat is noise.
    expect(tierOverstatesCall(metrics({ downMbps: 3, upMbps: 1 }))).toBe(false);
  });

  it("makes no claim without readings", () => {
    expect(tierOverstatesCall(metrics({ samples: 0, downMbps: 200, upMbps: 1 }))).toBe(false);
  });
});

describe("callCaveat", () => {
  it("names the bottleneck when a callable-looking station is limited", () => {
    // Local tier (36 down) with packet loss — the tier is honest, but calls
    // are not comfortable, and that is worth a line on the card.
    expect(callCaveat(metrics({ downMbps: 36, upMbps: 8, lossPct: 6 }))).toBe("packet loss");
  });

  it("stays silent on a station that holds calls comfortably", () => {
    expect(callCaveat(metrics())).toBeNull();
  });

  it("stays silent on the suspended line, which already reads as avoid", () => {
    expect(callCaveat(metrics({ downMbps: 6, upMbps: 1.8 }))).toBeNull();
  });

  it("stays silent without readings", () => {
    expect(callCaveat(metrics({ samples: 0, downMbps: 200, upMbps: 1 }))).toBeNull();
  });

  it("fires on the pattern tierOverstatesCall also catches", () => {
    // Superset relationship: anything the reconciliation notice flags must also
    // be visible on the card, or the drawer would contradict the card.
    const station = metrics({ downMbps: 200, upMbps: 1 });
    expect(tierOverstatesCall(station)).toBe(true);
    expect(callCaveat(station)).toBe("upload");
  });
});
