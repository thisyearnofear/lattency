-- Sponsorships + bounties — the business-model preview promoted from
-- TypeScript modules to real DB tables. With these landed, partner sign-ups
-- and bounty funding can write to the same store the read path serves from.
--
-- Sponsorships: one active sponsor per café for v1. A `sponsorships` row
-- attaches an ISP, café owner, community member, or anonymous sponsor to a
-- specific café. The materialized view is recreated to include the active
-- sponsor in the read path, so a homepage card knows its sponsor in one
-- query, not N+1.
--
-- Bounties: pre-funded incentives for verified contributions. Sponsors stake
-- against a specific target (first-in-neighbourhood, attribute-match,
-- tier-target, nth-contributor) and the bounty resolves when the contribution
-- mechanic confirms it. Payouts are recorded via paid_out + paid_at; the
-- actual rail (M-Pesa / Stripe / on-chain) lands in a later migration.

-- ── Sponsorships ───────────────────────────────────────────────────────────

CREATE TABLE sponsorships (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  cafe_id       UUID         NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  sponsor_name  TEXT         NOT NULL,
  sponsor_kind  TEXT         NOT NULL
    CHECK (sponsor_kind IN ('isp','café','community','anon')),
  tagline       TEXT,
  starts_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One active sponsorship per café — partial unique index on still-open rows.
-- `now()` isn't immutable so the predicate uses NULL as "still open" and
-- relies on the app to set ends_at when terminating a sponsorship.
CREATE UNIQUE INDEX sponsorships_active_cafe_id
  ON sponsorships (cafe_id)
  WHERE ends_at IS NULL;

CREATE INDEX sponsorships_sponsor_name_idx
  ON sponsorships (sponsor_name);

-- ── Bounties ──────────────────────────────────────────────────────────────

CREATE TABLE bounties (
  -- TEXT primary key so seed data uses stable, human-readable slugs and
  -- re-seeding is idempotent via ON CONFLICT DO NOTHING. Real user-created
  -- bounties will use generated slugs.
  id            TEXT         PRIMARY KEY,
  goal          TEXT         NOT NULL,
  area          TEXT         NOT NULL,
  amount_usd    NUMERIC(7,2) NOT NULL CHECK (amount_usd > 0),
  target        INT          NOT NULL CHECK (target > 0),
  progress      INT          NOT NULL DEFAULT 0 CHECK (progress >= 0),
  kind          TEXT         NOT NULL
    CHECK (kind IN ('first-in-neighbourhood','attribute-match','tier-target','nth-contributor')),
  sponsor_name  TEXT         NOT NULL,
  sponsor_kind  TEXT         NOT NULL
    CHECK (sponsor_kind IN ('isp','café','community','anon')),
  -- Optional café anchor; nth-contributor bounties pin to a specific café,
  -- others target an area only.
  cafe_id       UUID         REFERENCES cafes(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ,
  paid_out      BOOLEAN      NOT NULL DEFAULT false,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX bounties_open_by_expiry_idx
  ON bounties (expires_at NULLS LAST)
  WHERE NOT paid_out;
CREATE INDEX bounties_cafe_id_idx ON bounties (cafe_id);

-- ── Materialized view recreation ──────────────────────────────────────────
-- Adds active-sponsor columns via LEFT JOIN so the homepage list query
-- still serves café + sponsor in one round-trip.

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
  END           AS tier,
  sp.sponsor_name,
  sp.sponsor_kind,
  sp.tagline    AS sponsor_tagline
FROM cafes c
JOIN measurements m ON m.cafe_id = c.id
LEFT JOIN sponsorships sp
  ON sp.cafe_id = c.id AND sp.ends_at IS NULL
GROUP BY
  c.id, c.name, c.neighbourhood, c.lat, c.lng, c.vibe,
  c.city, c.price_tier, c.milk_options, c.power_outlets, c.seating,
  c.wifi_network, c.photo_url,
  sp.sponsor_name, sp.sponsor_kind, sp.tagline;

CREATE UNIQUE INDEX cafe_speed_stats_cafe_id ON cafe_speed_stats (cafe_id);
