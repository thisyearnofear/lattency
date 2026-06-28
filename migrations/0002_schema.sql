-- Café "stations" on the metro map and the speed measurements that tier them.

CREATE TABLE cafes (
  id            UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT                    NOT NULL,
  neighbourhood TEXT                    NOT NULL,
  lat           DOUBLE PRECISION        NOT NULL,
  lng           DOUBLE PRECISION        NOT NULL,
  location      GEOGRAPHY(Point, 4326)  NOT NULL,
  created_at    TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE INDEX cafes_location_gist ON cafes USING GIST (location);

CREATE TABLE measurements (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  cafe_id        UUID         NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  down_mbps      NUMERIC(7,2) NOT NULL CHECK (down_mbps  >= 0),
  up_mbps        NUMERIC(7,2) NOT NULL CHECK (up_mbps    >= 0),
  latency_ms     NUMERIC(7,2) NOT NULL CHECK (latency_ms >= 0),
  measured_at    TIMESTAMPTZ  NOT NULL,
  time_bucket    TEXT         NOT NULL CHECK (time_bucket IN ('morning','afternoon','evening')),
  contributor_id TEXT,
  photo_url      TEXT
);

CREATE INDEX measurements_measured_at_brin ON measurements USING BRIN (measured_at);
CREATE INDEX measurements_cafe_id_idx      ON measurements (cafe_id);

-- Per-café median speed + tier. The three tiers are the metro "lines":
--   express   ≥ 50 Mbps   (the fast line)
--   local     10–49 Mbps  (the regular line)
--   suspended < 10 Mbps   (out of service)
--
-- INNER JOIN so cafés with no measurements simply don't appear in the view —
-- the read path can LEFT JOIN cafés ⨝ stats and surface "no data yet" itself.
CREATE MATERIALIZED VIEW cafe_speed_stats AS
SELECT
  c.id          AS cafe_id,
  c.name,
  c.neighbourhood,
  c.lat,
  c.lng,
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
GROUP BY c.id, c.name, c.neighbourhood, c.lat, c.lng;

CREATE UNIQUE INDEX cafe_speed_stats_cafe_id ON cafe_speed_stats (cafe_id);
