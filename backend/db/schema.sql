PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    DEFAULT (datetime('now')),
  last_login    TEXT
);

CREATE TABLE IF NOT EXISTS properties (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  type            TEXT    NOT NULL DEFAULT 'sale' CHECK(type IN ('sale', 'rent')),
  price           REAL    NOT NULL DEFAULT 0,
  levy            TEXT,
  bedrooms        INTEGER DEFAULT 0,
  bathrooms       INTEGER DEFAULT 0,
  location        TEXT    NOT NULL DEFAULT '',
  description     TEXT,
  status          TEXT    NOT NULL DEFAULT 'available'
                    CHECK(status IN ('available','under-offer','sold','rented')),
  units_available INTEGER DEFAULT 1,
  rental_option   INTEGER DEFAULT 0,
  contact_phone   TEXT    DEFAULT '0858196462',
  featured        INTEGER DEFAULT 0,
  slug            TEXT    UNIQUE NOT NULL,
  created_at      TEXT    DEFAULT (datetime('now')),
  updated_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS property_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  filename    TEXT    NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  is_cover    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS insurance_products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT    NOT NULL,
  category          TEXT,
  short_description TEXT,
  full_description  TEXT,
  icon_name         TEXT    DEFAULT 'fa-shield-halved',
  sort_order        INTEGER DEFAULT 0,
  active            INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  phone           TEXT,
  email           TEXT,
  message         TEXT,
  source_division TEXT    NOT NULL DEFAULT 'real-estate'
                    CHECK(source_division IN ('real-estate','insurance')),
  property_id     INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  status          TEXT    NOT NULL DEFAULT 'new'
                    CHECK(status IN ('new','contacted','closed')),
  created_at      TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_properties_slug    ON properties(slug);
CREATE INDEX IF NOT EXISTS idx_properties_status  ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_featured ON properties(featured);
CREATE INDEX IF NOT EXISTS idx_property_images_pid ON property_images(property_id);
CREATE INDEX IF NOT EXISTS idx_leads_status       ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_division     ON leads(source_division);
