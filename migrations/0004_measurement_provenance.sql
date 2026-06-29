-- Measurement provenance + connection quality.
--
-- The original schema captured three hand-typed numbers (down/up/ping) with
-- no record of how they were measured. This migration adds:
--   1. Connection quality: jitter_ms, loss_pct — the stability axis that
--      bandwidth-only tiers miss. A café can be "express" on throughput and
--      hostile to video calls because of jitter.
--   2. Provenance: test_method, target_server, device_type, download_bytes,
--      download_duration_ms — so the system can weight auto-test readings
--      higher than manual guesses and so data stays interpretable as the
--      edge topology evolves.
--
-- All new columns are nullable so existing rows and manual entries still
-- insert cleanly. The materialized view gains median_jitter_ms and
-- median_loss_pct; COALESCE to 0 so the read path always returns a number.

ALTER TABLE measurements
  ADD COLUMN jitter_ms            NUMERIC(7,2)  CHECK (jitter_ms >= 0),
  ADD COLUMN loss_pct             NUMERIC(5,2)  CHECK (loss_pct >= 0 AND loss_pct <= 100),
  ADD COLUMN test_method          TEXT          NOT NULL DEFAULT 'manual'
                                  CHECK (test_method IN ('manual','browser-auto')),
  ADD COLUMN target_server        TEXT,
  ADD COLUMN device_type          TEXT,
  ADD COLUMN download_bytes       BIGINT,
  ADD COLUMN download_duration_ms INTEGER;

-- Stats view re-creation: expose median jitter and loss alongside the
-- existing medians. COALESCE so rows with no auto-test data still produce
-- clean numbers (0) rather than NULL — the UI treats 0 as "no data".
DROP MATERIALIZED VIEW cafe_speed_stats;

CREATE MATERIALIZED VIEW cafe_speed_stats AS
SELECT
  c.id          AS cafe_id,
  c.name,
  c.neighbourhood,
  c.lat,
  c.lng,
  c.vibe,
  COUNT(m.id)                                                   AS measurement_count,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY m.down_mbps)      AS median_down_mbps,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY m.up_mbps)        AS median_up_mbps,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY m.latency_ms)     AS median_latency_ms,
  COALESCE(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY m.jitter_ms),
    0
  )                                                             AS median_jitter_ms,
  COALESCE(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY m.loss_pct),
    0
  )                                                             AS median_loss_pct,
  CASE
    WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY m.down_mbps) >= 50 THEN 'express'
    WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY m.down_mbps) >= 10 THEN 'local'
    ELSE 'suspended'
  END           AS tier
FROM cafes c
JOIN measurements m ON m.cafe_id = c.id
GROUP BY c.id, c.name, c.neighbourhood, c.lat, c.lng, c.vibe;

CREATE UNIQUE INDEX cafe_speed_stats_cafe_id ON cafe_speed_stats (cafe_id);
