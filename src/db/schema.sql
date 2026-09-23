-- All timestamps are ISO-8601 UTC strings ("2026-10-01T15:00:00.000Z") so they
-- compare correctly as text. Money is integer cents.

CREATE TABLE IF NOT EXISTS artists (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  email                  TEXT NOT NULL UNIQUE,
  password_hash          TEXT NOT NULL,
  handle                 TEXT NOT NULL UNIQUE,
  display_name           TEXT NOT NULL,
  bio                    TEXT NOT NULL DEFAULT '',
  location               TEXT NOT NULL DEFAULT '',
  instagram              TEXT NOT NULL DEFAULT '',
  timezone               TEXT NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'usd',
  policy                 TEXT NOT NULL DEFAULT '',
  slot_step_min          INTEGER NOT NULL DEFAULT 30,
  min_notice_hours       INTEGER NOT NULL DEFAULT 12,
  max_days_ahead         INTEGER NOT NULL DEFAULT 60,
  cancel_window_hours    INTEGER NOT NULL DEFAULT 48,
  stripe_account_id      TEXT,
  stripe_charges_enabled INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  subscription_status    TEXT,
  trial_ends_at          TEXT NOT NULL,
  created_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  artist_id  INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id     INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  duration_min  INTEGER NOT NULL,
  price_cents   INTEGER,              -- NULL = "price varies / quoted"
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- One working window per weekday (0 = Sunday), in the artist's local time.
CREATE TABLE IF NOT EXISTS availability (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  weekday   INTEGER NOT NULL,
  start_min INTEGER NOT NULL,
  end_min   INTEGER NOT NULL,
  PRIMARY KEY (artist_id, weekday)
);

CREATE TABLE IF NOT EXISTS blocked_dates (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  date      TEXT NOT NULL,            -- YYYY-MM-DD, artist's local calendar
  PRIMARY KEY (artist_id, date)
);

CREATE TABLE IF NOT EXISTS bookings (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id                  INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  service_id                 INTEGER NOT NULL REFERENCES services(id),
  public_token               TEXT NOT NULL UNIQUE,
  service_name               TEXT NOT NULL,
  starts_at                  TEXT NOT NULL,
  ends_at                    TEXT NOT NULL,
  -- pending_payment | confirmed | cancelled | expired
  status                     TEXT NOT NULL,
  hold_expires_at            TEXT,
  client_name                TEXT NOT NULL,
  client_email               TEXT NOT NULL,
  client_phone               TEXT NOT NULL DEFAULT '',
  client_instagram           TEXT NOT NULL DEFAULT '',
  notes                      TEXT NOT NULL DEFAULT '',
  reference_url              TEXT NOT NULL DEFAULT '',
  deposit_cents              INTEGER NOT NULL DEFAULT 0,
  currency                   TEXT NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id   TEXT,
  deposit_paid               INTEGER NOT NULL DEFAULT 0,
  refunded                   INTEGER NOT NULL DEFAULT 0,
  cancelled_by               TEXT,
  reminder_sent_at           TEXT,
  created_at                 TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_artist_start ON bookings(artist_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status_start ON bookings(status, starts_at);
