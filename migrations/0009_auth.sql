-- Auth.js (NextAuth v5) tables — the standard schema the pg adapter
-- expects. Adds:
--   1. users + accounts + sessions + verification_token (Auth.js shape)
--   2. contributor_user_id on measurements + created_by_user_id on cafes
--      so logged-in contributions get attributed to the user, while
--      anonymous contributions keep working (FK is nullable, IP-hash path
--      remains the rate-limit primary key).
--
-- Magic-link auth via Resend uses verification_token + email-on-users for
-- the round-trip. No password field — that's by design.

CREATE TABLE users (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT,
  email         TEXT         UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image         TEXT
);

CREATE TABLE accounts (
  id                   UUID NOT NULL DEFAULT uuid_generate_v4(),
  "userId"             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  provider             TEXT NOT NULL,
  "providerAccountId"  TEXT NOT NULL,
  refresh_token        TEXT,
  access_token         TEXT,
  expires_at           BIGINT,
  id_token             TEXT,
  scope                TEXT,
  session_state        TEXT,
  token_type           TEXT,
  PRIMARY KEY (provider, "providerAccountId")
);

CREATE TABLE sessions (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId"       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        TIMESTAMPTZ  NOT NULL,
  "sessionToken" TEXT         NOT NULL UNIQUE
);

CREATE TABLE verification_token (
  identifier TEXT         NOT NULL,
  token      TEXT         NOT NULL,
  expires    TIMESTAMPTZ  NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ── Contribution attribution ──────────────────────────────────────────────
-- Both columns are nullable: anonymous contributions continue to work,
-- they're just not attributed to a user. The IP-hash rate-limit still
-- guards anonymous abuse. When a logged-in user contributes, the user_id
-- gets set and the "Your contributions" page can list their readings.

ALTER TABLE measurements
  ADD COLUMN contributor_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX measurements_contributor_user_id_idx
  ON measurements (contributor_user_id)
  WHERE contributor_user_id IS NOT NULL;

ALTER TABLE cafes
  ADD COLUMN created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX cafes_created_by_user_id_idx
  ON cafes (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;
