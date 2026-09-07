
-- Grid Vector Racer — Neon/PostgreSQL production schema
-- Version: 0.9.5 backend foundation
-- Run once in Neon SQL Editor on the production database.

BEGIN;

CREATE TABLE IF NOT EXISTS players (
    id                  BIGSERIAL PRIMARY KEY,
    platform            TEXT NOT NULL,
    platform_user_id    TEXT NOT NULL,
    display_name        TEXT NOT NULL DEFAULT 'Player',
    avatar_url          TEXT,
    rating              INTEGER NOT NULL DEFAULT 1000,
    wins                INTEGER NOT NULL DEFAULT 0,
    losses              INTEGER NOT NULL DEFAULT 0,
    races               INTEGER NOT NULL DEFAULT 0,
    best_time_ms        BIGINT,
    coins               INTEGER NOT NULL DEFAULT 0,
    premium             BOOLEAN NOT NULL DEFAULT FALSE,
    pro_until           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(platform, platform_user_id)
);

CREATE INDEX IF NOT EXISTS idx_players_rating
    ON players (rating DESC, wins DESC, id ASC);

CREATE INDEX IF NOT EXISTS idx_players_wins
    ON players (wins DESC, rating DESC, id ASC);

CREATE INDEX IF NOT EXISTS idx_players_best_time
    ON players (best_time_ms ASC NULLS LAST, id ASC);

CREATE TABLE IF NOT EXISTS matches (
    id                  BIGSERIAL PRIMARY KEY,
    room_code           TEXT,
    mode                TEXT NOT NULL DEFAULT 'online',
    track_seed          BIGINT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at         TIMESTAMPTZ,
    winner_player_id    BIGINT REFERENCES players(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS match_players (
    match_id            BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id           BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    finish_place        INTEGER,
    old_rating          INTEGER,
    new_rating          INTEGER,
    crashes             INTEGER NOT NULL DEFAULT 0,
    turns               INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
);

CREATE TABLE IF NOT EXISTS purchases (
    id                  BIGSERIAL PRIMARY KEY,
    platform            TEXT NOT NULL,
    purchase_token      TEXT NOT NULL UNIQUE,
    player_id           BIGINT REFERENCES players(id) ON DELETE SET NULL,
    product_id          TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'received',
    price_currency      TEXT,
    price_value         TEXT,
    purchased_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at         TIMESTAMPTZ,
    raw_payload         JSONB
);

CREATE INDEX IF NOT EXISTS idx_purchases_player
    ON purchases (player_id, purchased_at DESC);

CREATE TABLE IF NOT EXISTS entitlement_events (
    id                  BIGSERIAL PRIMARY KEY,
    player_id           BIGINT REFERENCES players(id) ON DELETE CASCADE,
    source              TEXT NOT NULL,
    product_id          TEXT NOT NULL,
    delta_coins         INTEGER NOT NULL DEFAULT 0,
    premium_granted     BOOLEAN NOT NULL DEFAULT FALSE,
    pro_until           TIMESTAMPTZ,
    purchase_token      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entitlement_events_player
    ON entitlement_events (player_id, created_at DESC);

CREATE OR REPLACE FUNCTION touch_players_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_players_touch ON players;
CREATE TRIGGER trg_players_touch
BEFORE UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION touch_players_updated_at();

COMMIT;
