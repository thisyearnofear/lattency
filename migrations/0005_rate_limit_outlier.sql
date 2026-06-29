-- Rate-limiting + outlier flagging.
--
-- Two concerns for a crowdsourced product at real traffic:
--
--   1. Rate-limiting: a single IP shouldn't be able to spam measurements
--      for the same café. We store a SHA-256 hash of the client IP (not
--      the raw IP — privacy-preserving; the hash is never returned by any
--      API endpoint) and check for a recent measurement from the same
--      IP+cafe pair before accepting a new one.
--
--   2. Outlier flagging: a reading that's wildly different from the café's
--      existing median is flagged for review. We don't reject it — a
--      genuine speed change (café upgraded their fibre) would be false-
--      positive'd. The flag is stored for future analysis and could be
--      used to exclude readings from the materialized view median once a
--      confirmation pattern emerges.
--
-- The materialized view is NOT recreated — outliers still count toward
-- the median for now. Excluding them is a product decision that needs
-- real traffic data to calibrate the thresholds.

ALTER TABLE measurements
  ADD COLUMN contributor_ip_hash TEXT,
  ADD COLUMN is_outlier          BOOLEAN      NOT NULL DEFAULT false;

-- Composite index for the rate-limit query:
--   SELECT 1 FROM measurements
--   WHERE contributor_ip_hash = $1 AND cafe_id = $2
--     AND measured_at > NOW() - INTERVAL '10 minutes' LIMIT 1
CREATE INDEX measurements_rate_limit_idx
  ON measurements (contributor_ip_hash, cafe_id, measured_at DESC);
