-- 12 real Nairobi cafés (3 per neighbourhood) with ~4 measurements each.
-- Re-runnable: TRUNCATE wipes the world before re-seeding. Cascades to
-- measurements. Refresh of cafe_speed_stats happens at the end.

BEGIN;

TRUNCATE cafes RESTART IDENTITY CASCADE;

WITH cafe_rows (name, neighbourhood, lat, lng, vibe) AS (
  VALUES
    -- Westlands
    ('Java House Sarit Centre',     'Westlands', -1.2603, 36.8030, 'weekday workhorse'),
    ('Artcaffe Westgate',           'Westlands', -1.2566, 36.8038, 'lunch rush regular'),
    ('Connect Coffee Roasters',     'Westlands', -1.2691, 36.8108, 'the speed dealers'),
    -- Kilimani
    ('Kaldi''s Coffee Yaya',        'Kilimani',  -1.2935, 36.7861, 'yaya regulars'),
    ('Brew Bistro Kilimani',        'Kilimani',  -1.2910, 36.7895, 'loud at lunch'),
    ('About Thyme',                 'Kilimani',  -1.2942, 36.7916, 'fibre + filter'),
    -- CBD
    ('Java House Mama Ngina',       'CBD',       -1.2860, 36.8211, 'downtown standby'),
    ('Savanna Coffee Lounge',       'CBD',       -1.2829, 36.8243, 'uptown for uplink'),
    ('Dormans Standard Street',     'CBD',       -1.2861, 36.8225, 'old school, slow lane'),
    -- Karen
    ('Talisman',                    'Karen',     -1.3217, 36.7099, 'garden over wires'),
    ('Karen Blixen Coffee Garden',  'Karen',     -1.3460, 36.7020, 'the book-wifi'),
    ('Java House The Hub Karen',    'Karen',     -1.3252, 36.7186, 'mall route')
),
inserted_cafes AS (
  INSERT INTO cafes (name, neighbourhood, lat, lng, vibe, location)
  SELECT name, neighbourhood, lat, lng, vibe,
         ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  FROM cafe_rows
  RETURNING id, name
),
measurement_rows (cafe_name, down_mbps, up_mbps, latency_ms, measured_at, time_bucket, photo_url) AS (
  VALUES
    -- Java House Sarit Centre — local (median ~31)
    ('Java House Sarit Centre',     28.0,  6.2, 32, '2026-06-22 08:15:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/sarit-a/600/400'),
    ('Java House Sarit Centre',     34.0,  8.1, 28, '2026-06-23 13:40:00+03'::timestamptz, 'afternoon', 'https://picsum.photos/seed/sarit-b/600/400'),
    ('Java House Sarit Centre',     22.0,  5.5, 41, '2026-06-25 19:05:00+03'::timestamptz, 'evening',   NULL),
    ('Java House Sarit Centre',     41.0,  9.8, 24, '2026-06-27 15:20:00+03'::timestamptz, 'afternoon', NULL),

    -- Artcaffe Westgate — local (median 21.5)
    ('Artcaffe Westgate',           18.0,  4.2, 38, '2026-06-21 09:30:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/westgate-a/600/400'),
    ('Artcaffe Westgate',           25.0,  7.0, 33, '2026-06-24 14:00:00+03'::timestamptz, 'afternoon', NULL),
    ('Artcaffe Westgate',           32.0,  8.5, 26, '2026-06-26 18:45:00+03'::timestamptz, 'evening',   'https://picsum.photos/seed/westgate-b/600/400'),
    ('Artcaffe Westgate',           14.0,  3.8, 52, '2026-06-28 11:10:00+03'::timestamptz, 'morning',   NULL),

    -- Connect Coffee Roasters — express (median 68.5)
    ('Connect Coffee Roasters',     72.0, 18.0, 14, '2026-06-22 10:00:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/connect-a/600/400'),
    ('Connect Coffee Roasters',     58.0, 14.2, 19, '2026-06-24 15:30:00+03'::timestamptz, 'afternoon', NULL),
    ('Connect Coffee Roasters',     65.0, 16.4, 16, '2026-06-25 20:15:00+03'::timestamptz, 'evening',   'https://picsum.photos/seed/connect-b/600/400'),
    ('Connect Coffee Roasters',     81.0, 22.0, 11, '2026-06-28 09:45:00+03'::timestamptz, 'morning',   NULL),

    -- Kaldi's Coffee Yaya — local (median 36.5)
    ('Kaldi''s Coffee Yaya',        38.0,  9.5, 27, '2026-06-21 08:45:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/kaldi-a/600/400'),
    ('Kaldi''s Coffee Yaya',        42.0, 10.8, 25, '2026-06-23 14:20:00+03'::timestamptz, 'afternoon', NULL),
    ('Kaldi''s Coffee Yaya',        35.0,  8.4, 29, '2026-06-26 19:50:00+03'::timestamptz, 'evening',   NULL),
    ('Kaldi''s Coffee Yaya',        29.0,  7.2, 34, '2026-06-28 12:30:00+03'::timestamptz, 'afternoon', 'https://picsum.photos/seed/kaldi-b/600/400'),

    -- Brew Bistro Kilimani — suspended (median 6)
    ('Brew Bistro Kilimani',         5.0,  1.4, 88, '2026-06-22 11:30:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/brew-a/600/400'),
    ('Brew Bistro Kilimani',         8.0,  2.1, 71, '2026-06-24 16:45:00+03'::timestamptz, 'afternoon', NULL),
    ('Brew Bistro Kilimani',         3.0,  0.9, 124, '2026-06-26 20:10:00+03'::timestamptz, 'evening',   NULL),
    ('Brew Bistro Kilimani',         7.0,  1.8, 95, '2026-06-28 13:00:00+03'::timestamptz, 'afternoon', NULL),

    -- About Thyme — express (median 91.5)
    ('About Thyme',                 95.0, 24.0, 12, '2026-06-22 09:15:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/thyme-a/600/400'),
    ('About Thyme',                 88.0, 22.5, 13, '2026-06-24 13:50:00+03'::timestamptz, 'afternoon', 'https://picsum.photos/seed/thyme-b/600/400'),
    ('About Thyme',                105.0, 28.0, 10, '2026-06-26 18:25:00+03'::timestamptz, 'evening',   NULL),
    ('About Thyme',                 76.0, 19.8, 15, '2026-06-28 10:40:00+03'::timestamptz, 'morning',   NULL),

    -- Java House Mama Ngina — local (median 23)
    ('Java House Mama Ngina',       24.0,  5.8, 36, '2026-06-21 11:00:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/mamangina-a/600/400'),
    ('Java House Mama Ngina',       18.0,  4.5, 44, '2026-06-23 15:15:00+03'::timestamptz, 'afternoon', NULL),
    ('Java House Mama Ngina',       31.0,  7.6, 28, '2026-06-25 18:00:00+03'::timestamptz, 'evening',   NULL),
    ('Java House Mama Ngina',       22.0,  5.4, 39, '2026-06-27 12:20:00+03'::timestamptz, 'afternoon', 'https://picsum.photos/seed/mamangina-b/600/400'),

    -- Savanna Coffee Lounge — express (median 58.5)
    ('Savanna Coffee Lounge',       55.0, 13.2, 18, '2026-06-22 08:30:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/savanna-a/600/400'),
    ('Savanna Coffee Lounge',       62.0, 15.8, 16, '2026-06-24 14:45:00+03'::timestamptz, 'afternoon', NULL),
    ('Savanna Coffee Lounge',       68.0, 17.5, 14, '2026-06-26 19:20:00+03'::timestamptz, 'evening',   'https://picsum.photos/seed/savanna-b/600/400'),
    ('Savanna Coffee Lounge',       51.0, 12.4, 20, '2026-06-28 11:00:00+03'::timestamptz, 'morning',   NULL),

    -- Dormans Standard Street — suspended (median 5)
    ('Dormans Standard Street',      4.0,  1.1, 102, '2026-06-21 10:15:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/dormans-a/600/400'),
    ('Dormans Standard Street',      6.0,  1.6,  84, '2026-06-23 14:00:00+03'::timestamptz, 'afternoon', NULL),
    ('Dormans Standard Street',      2.0,  0.7, 156, '2026-06-25 17:30:00+03'::timestamptz, 'evening',   NULL),
    ('Dormans Standard Street',      9.0,  2.4,  68, '2026-06-27 12:45:00+03'::timestamptz, 'afternoon', NULL),

    -- Talisman — local (median 30)
    ('Talisman',                    32.0,  8.0, 30, '2026-06-22 11:45:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/talisman-a/600/400'),
    ('Talisman',                    28.0,  7.1, 34, '2026-06-24 13:20:00+03'::timestamptz, 'afternoon', 'https://picsum.photos/seed/talisman-b/600/400'),
    ('Talisman',                    45.0, 11.2, 22, '2026-06-26 19:00:00+03'::timestamptz, 'evening',   NULL),
    ('Talisman',                    22.0,  5.6, 41, '2026-06-28 15:00:00+03'::timestamptz, 'afternoon', NULL),

    -- Karen Blixen Coffee Garden — express (median 83)
    ('Karen Blixen Coffee Garden',  78.0, 20.0, 15, '2026-06-21 09:00:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/blixen-a/600/400'),
    ('Karen Blixen Coffee Garden',  92.0, 24.5, 12, '2026-06-23 14:30:00+03'::timestamptz, 'afternoon', NULL),
    ('Karen Blixen Coffee Garden',  65.0, 16.8, 18, '2026-06-25 17:45:00+03'::timestamptz, 'evening',   'https://picsum.photos/seed/blixen-b/600/400'),
    ('Karen Blixen Coffee Garden',  88.0, 22.2, 13, '2026-06-28 10:15:00+03'::timestamptz, 'morning',   NULL),

    -- Java House The Hub Karen — local (median 36.5)
    ('Java House The Hub Karen',    38.0,  9.4, 26, '2026-06-22 09:30:00+03'::timestamptz, 'morning',   'https://picsum.photos/seed/hub-a/600/400'),
    ('Java House The Hub Karen',    42.0, 10.5, 24, '2026-06-24 15:00:00+03'::timestamptz, 'afternoon', NULL),
    ('Java House The Hub Karen',    35.0,  8.8, 28, '2026-06-26 18:30:00+03'::timestamptz, 'evening',   'https://picsum.photos/seed/hub-b/600/400'),
    ('Java House The Hub Karen',    29.0,  7.3, 33, '2026-06-28 13:45:00+03'::timestamptz, 'afternoon', NULL)
)
INSERT INTO measurements (cafe_id, down_mbps, up_mbps, latency_ms, measured_at, time_bucket, photo_url)
SELECT ic.id, mr.down_mbps, mr.up_mbps, mr.latency_ms, mr.measured_at, mr.time_bucket, mr.photo_url
FROM measurement_rows mr
JOIN inserted_cafes  ic ON ic.name = mr.cafe_name;

REFRESH MATERIALIZED VIEW cafe_speed_stats;

COMMIT;
