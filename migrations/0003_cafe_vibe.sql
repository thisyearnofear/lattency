-- Editorial atmosphere descriptor surfaced on station cards and in the map's
-- station-detail overlay. Nullable so future contributor submissions don't
-- require it; the seed backfills the 12 founding stations.

ALTER TABLE cafes ADD COLUMN vibe TEXT;

-- Stats view re-creation: include vibe so the read-path can return it with
-- one query against cafe_speed_stats.
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
  CASE
    WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY m.down_mbps) >= 50 THEN 'express'
    WHEN percentile_cont(0.5) WITHIN GROUP (ORDER BY m.down_mbps) >= 10 THEN 'local'
    ELSE 'suspended'
  END           AS tier
FROM cafes c
JOIN measurements m ON m.cafe_id = c.id
GROUP BY c.id, c.name, c.neighbourhood, c.lat, c.lng, c.vibe;

CREATE UNIQUE INDEX cafe_speed_stats_cafe_id ON cafe_speed_stats (cafe_id);
