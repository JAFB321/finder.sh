-- finder.sh library schema. Applied idempotently on startup (see index.ts migrations).

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS roots (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  volume_uuid TEXT,
  added_at INTEGER NOT NULL,
  last_scan_at INTEGER
);

-- One row per physical file on disk.
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
  path TEXT NOT NULL UNIQUE,
  dir TEXT NOT NULL,
  base TEXT NOT NULL,           -- filename without extension, lowercased
  ext TEXT NOT NULL,            -- lowercased, no dot
  kind TEXT NOT NULL,           -- image | video | other
  is_raw INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',  -- ok | missing | offline
  seen_scan INTEGER NOT NULL DEFAULT 0,
  full_hash TEXT,               -- sha1 of whole file, lazily computed for byte-duplicate detection
  quick_hash TEXT               -- sha1 of first+last 64 KB; pre-filter before full_hash
);
-- idx_files_size_hash (size, full_hash) is created in db/assets.ts ensureFullHash(): older DBs gain the columns via ALTER there.
CREATE INDEX IF NOT EXISTS idx_files_root_dir ON files(root_id, dir);
CREATE INDEX IF NOT EXISTS idx_files_asset ON files(asset_id);
CREATE INDEX IF NOT EXISTS idx_files_pair ON files(dir, base);

-- Logical image. RAW+JPG pair -> one asset.
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY,
  root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  dir TEXT NOT NULL,
  name TEXT NOT NULL,           -- display name (basename of primary file)
  primary_file_id INTEGER,      -- file used for thumbs/meta (prefers RAW)
  content_hash TEXT,            -- cheap hash of primary file, key for thumb cache
  kind TEXT NOT NULL DEFAULT 'image',
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  taken_at INTEGER,
  mtime INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  label INTEGER NOT NULL DEFAULT 0,
  thumb_state INTEGER NOT NULL DEFAULT 0,   -- 0 none, 1 ready, -1 failed
  flags INTEGER NOT NULL DEFAULT 0,         -- 1 pair, 2 offline, 4 missing, 8 video
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_root_dir ON assets(root_id, dir);
CREATE INDEX IF NOT EXISTS idx_assets_taken ON assets(taken_at);
CREATE INDEX IF NOT EXISTS idx_assets_label ON assets(label);
CREATE INDEX IF NOT EXISTS idx_assets_hash ON assets(content_hash);

CREATE TABLE IF NOT EXISTS asset_meta (
  asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  orientation INTEGER NOT NULL DEFAULT 1,
  camera TEXT,
  lens TEXT,
  focal REAL,
  iso INTEGER,
  aperture REAL,
  shutter REAL,
  lat REAL,
  lon REAL,
  duration REAL                 -- seconds, videos only
);

CREATE TABLE IF NOT EXISTS asset_visual (
  asset_id INTEGER PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  phash INTEGER,                -- 64-bit perceptual hash stored as signed int64
  dominant TEXT,                -- JSON [{r,g,b,weight}] top 5
  lab_l REAL, lab_a REAL, lab_b REAL   -- mean color in Lab for cheap color distance
);
CREATE INDEX IF NOT EXISTS idx_visual_phash ON asset_visual(phash);

-- Top-N dominant colors per asset in Lab, one row each, for SQL color distance queries.
CREATE TABLE IF NOT EXISTS asset_colors (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  l REAL NOT NULL, a REAL NOT NULL, b REAL NOT NULL,
  weight REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_colors_asset ON asset_colors(asset_id);

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS asset_keywords (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  keyword_id INTEGER NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, keyword_id)
);
CREATE INDEX IF NOT EXISTS idx_ak_keyword ON asset_keywords(keyword_id);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  smart_filter TEXT,            -- JSON LibraryFilter or NULL for manual
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_assets (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (collection_id, asset_id)
);

-- Persistent job queue. One row per (asset, kind).
CREATE TABLE IF NOT EXISTS jobs (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- meta | thumb | visual | embed
  state TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,   -- higher first
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (asset_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_jobs_pick ON jobs(state, kind, priority DESC, asset_id);

-- Full text: name, folder segments, keywords (kept in sync by tags module).
CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
  asset_id UNINDEXED,
  name,
  folder,
  keywords,
  tokenize = 'unicode61 remove_diacritics 2'
);
