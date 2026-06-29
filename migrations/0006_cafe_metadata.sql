-- Café metadata + user-generated café support.
--
-- Transforms lattency from "12 seeded Nairobi cafés" to an open platform
-- where anyone can map a café anywhere. Adds:
--   1. City column — so cafés can belong to any city, not just Nairobi
--   2. Coffee metadata — price tier, milk options, power outlets, seating
--   3. Photo — Base64 data URL (hackathon; Vercel Blob for production)
--   4. Creator IP hash — for rate-limiting café creation (one per IP per hour)
--
-- All columns are nullable so existing seeded cafés and the mock fallback
-- continue to work without modification.

ALTER TABLE cafes
  ADD COLUMN city              TEXT,
  ADD COLUMN price_tier        TEXT
    CHECK (price_tier IN ('budget','mid','premium')),
  ADD COLUMN milk_options      TEXT[],
  ADD COLUMN power_outlets     BOOLEAN,
  ADD COLUMN seating           TEXT
    CHECK (seating IN ('bar','tables','lounge','mixed')),
  ADD COLUMN wifi_network      TEXT,
  ADD COLUMN photo_url         TEXT,
  ADD COLUMN created_by_ip_hash TEXT;

-- Backfill existing seeded cafés with city = 'nairobi'
UPDATE cafes SET city = 'nairobi' WHERE city IS NULL;

-- Rate-limit index for café creation (one per IP per hour)
CREATE INDEX cafes_created_by_ip_hash_idx
  ON cafes (created_by_ip_hash, created_at DESC)
  WHERE created_by_ip_hash IS NOT NULL;

-- Stats view re-creation: include city + metadata so the read path returns
-- everything in one query against cafe_speed_stats.
DROP MATERIALIZED VIEW cafe_speed_stats;

CREATE MATERIALIZED VIEW cafe_speed_stats AS
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
GROUP BY c.id, c.name, c.neighbourhood, c.lat, c.lng, c.vibe,
  c.city, c.price_tier, c.milk_options, c.power_outlets, c.seating,
  c.wifi_network, c.photo_url;

CREATE UNIQUE INDEX cafe_speed_stats_cafe_id ON cafe_speed_stats (cafe_id);
