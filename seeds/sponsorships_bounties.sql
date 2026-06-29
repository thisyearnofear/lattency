-- Seed the v1 demo sponsorships and bounties. Mirrors the data that
-- previously lived in lib/sponsors.ts and lib/bounties.ts. Idempotent —
-- safe to re-run.

-- ── Sponsorships ───────────────────────────────────────────────────────────
-- Two seeded sponsorships, one per market. The unique partial index on
-- (cafe_id) WHERE ends_at IS NULL keeps re-runs from inserting duplicates.

INSERT INTO sponsorships (cafe_id, sponsor_name, sponsor_kind, tagline)
SELECT c.id, s.sponsor_name, s.sponsor_kind, s.tagline
FROM cafes c
JOIN (VALUES
  ('Connect Coffee Roasters', 'Safaricom Fibre', 'isp', 'Powered by 1 Gbps home fibre'),
  ('Mazarine Coffee',         'Sonic.net',       'isp', 'Powered by 10 Gbps symmetric fibre')
) AS s(cafe_name, sponsor_name, sponsor_kind, tagline)
  ON c.name = s.cafe_name
WHERE NOT EXISTS (
  SELECT 1 FROM sponsorships sp
  WHERE sp.cafe_id = c.id AND sp.ends_at IS NULL
);

-- ── Bounties ──────────────────────────────────────────────────────────────
-- Mix of ISP-funded, café-funded, and community-funded bounties spanning
-- both seeded cities. The nth-contributor bounty pins to a real café row.

INSERT INTO bounties
  (id, goal, area, amount_usd, target, progress, kind, sponsor_name, sponsor_kind, cafe_id, expires_at)
VALUES
  ('b-eastleigh-first',         'First verified café in Eastleigh',                'Eastleigh · Nairobi',     5,  1, 0, 'first-in-neighbourhood', '@nairobikiwi',  'community', NULL, '2026-07-15'::timestamptz),
  ('b-safaricom-kilimani-oat',  'Map 3 oat-milk cafés in Kilimani',                'Kilimani · Nairobi',     15,  3, 1, 'attribute-match',        'Safaricom Fibre','isp',      NULL, '2026-07-08'::timestamptz),
  ('b-cbd-express-5',           '5 express-tier cafés across CBD',                 'CBD · Nairobi',          25,  5, 2, 'tier-target',            'Liquid Telecom', 'isp',      NULL, '2026-07-12'::timestamptz),
  ('b-lavington-first',         'First verified café in Lavington',                'Lavington · Nairobi',     5,  1, 0, 'first-in-neighbourhood', '@workmunyao',    'community', NULL, '2026-07-22'::timestamptz),
  ('b-sf-mission-fast-3',       '3 express-tier cafés in the Mission',             'Mission · San Francisco', 20, 3, 1, 'tier-target',            'Sonic.net',      'isp',      NULL, '2026-07-09'::timestamptz)
ON CONFLICT (id) DO NOTHING;

-- Nth-contributor bounty needs the café_id from the cafes table.
INSERT INTO bounties
  (id, goal, area, amount_usd, target, progress, kind, sponsor_name, sponsor_kind, cafe_id, expires_at)
SELECT
  'b-savanna-10th-contrib',
  'Be the 10th verified speed test at Savanna Coffee Lounge',
  'CBD · Nairobi',
  5, 10, 6,
  'nth-contributor',
  'Savanna Coffee Lounge',
  'café',
  c.id,
  '2026-07-30'::timestamptz
FROM cafes c
WHERE c.name = 'Savanna Coffee Lounge'
ON CONFLICT (id) DO NOTHING;

-- Refresh the MV so the new active-sponsor join is reflected immediately.
REFRESH MATERIALIZED VIEW CONCURRENTLY cafe_speed_stats;
