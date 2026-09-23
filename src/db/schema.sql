-- All timestamps are ISO-8601 UTC strings ("2026-10-01T15:00:00.000Z") so they
-- compare correctly as text. Money is integer hundredths of the currency unit.
--
-- Columns added after the first release also live in ADDED_COLUMNS in
-- index.js, which brings older databases up to date on boot.

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
  -- How long an unpaid request holds its slot before it's released.
  hold_hours             INTEGER NOT NULL DEFAULT 24,
  -- JSON array of {type, value}: how clients send the artist their deposit.
  payment_methods        TEXT NOT NULL DEFAULT '[]',
  payment_note           TEXT NOT NULL DEFAULT '',
  theme                  TEXT NOT NULL DEFAULT 'vermilion',
  avatar_image_id        INTEGER,
  calendar_token         TEXT,
  is_demo                INTEGER NOT NULL DEFAULT 0,
  -- Closed books: no new bookings or requests, and the page collects a waitlist.
  books_open             INTEGER NOT NULL DEFAULT 1,
  books_closed_message   TEXT NOT NULL DEFAULT '',
  waitlist_notified_at   TEXT,
  -- Consent form clients sign before the appointment. Statements are a JSON
  -- array of strings the client must agree to.
  consent_enabled        INTEGER NOT NULL DEFAULT 0,
  consent_intro          TEXT NOT NULL DEFAULT '',
  consent_statements     TEXT NOT NULL DEFAULT '[]',
  aftercare_enabled      INTEGER NOT NULL DEFAULT 0,
  aftercare_text         TEXT NOT NULL DEFAULT '',
  review_url             TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  artist_id  INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE TABLE IF NOT EXISTS services (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id     INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  duration_min  INTEGER NOT NULL,
  price_cents   INTEGER,              -- NULL = "price varies / quoted"
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  -- book: clients pick a time straight away. consult: they send their idea
  -- first and the artist replies with a quote.
  mode          TEXT NOT NULL DEFAULT 'book',
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
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id           INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  service_id          INTEGER NOT NULL REFERENCES services(id),
  public_token        TEXT NOT NULL UNIQUE,
  ref_code            TEXT,
  service_name        TEXT NOT NULL,
  starts_at           TEXT NOT NULL,
  ends_at             TEXT NOT NULL,
  -- awaiting_deposit | confirmed | cancelled | expired
  status              TEXT NOT NULL,
  hold_expires_at     TEXT,
  client_name         TEXT NOT NULL,
  client_email        TEXT NOT NULL,
  client_phone        TEXT NOT NULL DEFAULT '',
  client_instagram    TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  reference_url       TEXT NOT NULL DEFAULT '',
  deposit_cents       INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL,
  deposit_paid        INTEGER NOT NULL DEFAULT 0,
  -- When the client said they'd sent the deposit, and which way.
  deposit_reported_at TEXT,
  deposit_method      TEXT NOT NULL DEFAULT '',
  -- none | owed | refunded. Slotlock never moves money: "owed" is a reminder
  -- for the artist to send the deposit back themselves.
  refund_status       TEXT NOT NULL DEFAULT 'none',
  cancelled_by        TEXT,
  cancel_reason       TEXT NOT NULL DEFAULT '',
  reminder_sent_at    TEXT,
  aftercare_sent_at   TEXT,
  -- Set when the booking came from an approved consultation request.
  request_id          INTEGER,
  created_at          TEXT NOT NULL
);

-- Consultation requests: the client's idea, then the artist's quote. A quoted
-- request turns into a normal booking when the client picks a time.
CREATE TABLE IF NOT EXISTS requests (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id           INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  service_id          INTEGER NOT NULL REFERENCES services(id),
  public_token        TEXT NOT NULL UNIQUE,
  service_name        TEXT NOT NULL,
  -- new | quoted | declined | booked | withdrawn
  status              TEXT NOT NULL DEFAULT 'new',
  client_name         TEXT NOT NULL,
  client_email        TEXT NOT NULL,
  client_phone        TEXT NOT NULL DEFAULT '',
  client_instagram    TEXT NOT NULL DEFAULT '',
  idea                TEXT NOT NULL,
  placement           TEXT NOT NULL DEFAULT '',
  size                TEXT NOT NULL DEFAULT '',
  style               TEXT NOT NULL DEFAULT '',
  quote_price_cents   INTEGER,
  quote_deposit_cents INTEGER,
  quote_duration_min  INTEGER,
  quote_message       TEXT NOT NULL DEFAULT '',
  quoted_at           TEXT,
  decline_reason      TEXT NOT NULL DEFAULT '',
  booking_id          INTEGER,
  currency            TEXT NOT NULL,
  created_at          TEXT NOT NULL
);

-- Reference photos clients attach to a request. Served by an unguessable key,
-- never by id: they can be photos of someone's body.
CREATE TABLE IF NOT EXISTS request_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  key        TEXT NOT NULL UNIQUE,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS waitlist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id   INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  -- For the "leave the waitlist" link in emails.
  token       TEXT NOT NULL UNIQUE,
  notified_at TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (artist_id, email)
);

-- A signed consent form. form_text is the exact wording the client agreed to,
-- so later edits to the artist's template don't change old records.
CREATE TABLE IF NOT EXISTS consents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id     INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  legal_name     TEXT NOT NULL,
  date_of_birth  TEXT NOT NULL,
  medical_notes  TEXT NOT NULL DEFAULT '',
  form_text      TEXT NOT NULL,
  signature_mime TEXT NOT NULL,
  signature      BLOB NOT NULL,
  signed_at      TEXT NOT NULL,
  ip             TEXT NOT NULL DEFAULT '',
  user_agent     TEXT NOT NULL DEFAULT ''
);

-- Profile photos and portfolio pieces. Small (resized in the browser before
-- upload), so they live in the database next to everything else.
CREATE TABLE IF NOT EXISTS images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id  INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,           -- avatar | portfolio
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_artist_start ON bookings(artist_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status_start ON bookings(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_images_artist ON images(artist_id, kind);
CREATE INDEX IF NOT EXISTS idx_requests_artist ON requests(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_request_photos ON request_photos(request_id);
