-- Outlier-aware median in cafe_speed_stats.
--
-- Until now the materialized view used every measurement in the median
-- calculation, including ones lib/rate-limit.ts flagged as outliers (>5×
-- or <0.2× the existing median, computed at insert time). Real-world
-- contributors will occasionally fat-finger a manual entry or get a
-- corrupted auto-test reading; including those in the headline median
-- shifts the tier and erodes trust in the map.
--
-- This migration recreates the MV with a conservative outlier exclusion:
--   - When a café has fewer than 3 measurements, ALL readings are used
--     (no baseline to call anything an outlier against).
--   - When a café has 3+ measurements, the median uses only readings
--     where is_outlier = FALSE.
--
-- Outliers stay in the `measurements` table — they're not deleted, just
-- excluded from the headline number. The Recent Readings ticker still
-- shows them so contributors notice when their own reading was flagged.

DROP MATERIALIZED VIEW cafe_speed_stats;

CREATE MATERIALIZED VIEW cafe_speed_stats AS
WITH counts AS (
  SELECT cafe_id, COUNT(*) AS total
  FROM measurements
  GROUP BY cafe_id
),
filtered AS (
  -- For each café, pick the rows that count toward the median:
  --   fewer than 3 readings → include everything
  --   3+ readings → exclude is_outlier = TRUE
  SELECT m.*
  FROM measurements m
  JOIN counts c ON c.cafe_id = m.cafe_id
  WHERE c.total < 3 OR m.is_outlier IS NOT TRUE
)
SELECT
  c.id              AS cafe_id,
  c.name,
  c.neighbourhood,
  c.lat,
  c.lng,
  c.vibe,
  c.city,
  c.price_tier,
  c.milk_options,
  c.power_outlets,
  c.seating,
  c.wifi_network,
  c.photo_url,
  -- measurement_count is the TOTAL on file, not just the non-outlier
  -- subset, so the UI's "N measurements on file" stays honest.
  COUNT(m.id)                                                   AS measurement_count,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY f.down_mbps)      AS median_down_mbps,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY f.up_mbps)        AS median_up_mbps,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY f.latency_ms)     AS median_latency_ms,
  COALESCE(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY f.jitter_ms),
    0
  )                                                             AS median_jitter_ms,
  COALESCE(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY f.loss_pct),
    0
  )                                                             AS median_loss_pct,
  CASE
    WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY f.down_mbps) >= 50 THEN 'express'
    WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY f.down_mbps) >= 10 THEN 'local'
    ELSE 'suspended'
  END           AS tier,
  sp.sponsor_name,
  sp.sponsor_kind,
  sp.tagline    AS sponsor_tagline
FROM cafes c
JOIN measurements m ON m.cafe_id = c.id
-- Re-join the filtered set for the median calculations. The non-filtered
-- `measurements` join above keeps measurement_count truthful.
LEFT JOIN filtered f ON f.id = m.id
LEFT JOIN sponsorships sp
  ON sp.cafe_id = c.id AND sp.ends_at IS NULL
GROUP BY
  c.id, c.name, c.neighbourhood, c.lat, c.lng, c.vibe,
  c.city, c.price_tier, c.milk_options, c.power_outlets, c.seating,
  c.wifi_network, c.photo_url,
  sp.sponsor_name, sp.sponsor_kind, sp.tagline;

CREATE UNIQUE INDEX cafe_speed_stats_cafe_id ON cafe_speed_stats (cafe_id);
