import Database from 'better-sqlite3'
import schema from './schema.sql?raw'
import * as sqliteVec from 'sqlite-vec'
import { paths } from '../paths'

export type DB = Database.Database

let db: DB | null = null

export const CLIP_DIM = 512

export function getDb(): DB {
  if (db) return db
  db = new Database(paths.db)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 268435456')
  db.pragma('cache_size = -65536')
  db.pragma('foreign_keys = ON')
  // Packaged builds keep the dylib outside app.asar (dlopen can't read inside the archive).
  db.loadExtension(sqliteVec.getLoadablePath().replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'))
  migrate(db)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

function migrate(d: DB): void {
  d.exec(schema)
  // sqlite-vec virtual table can't be created with IF NOT EXISTS on older versions; guard manually.
  const hasVec = d
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vec_clip'")
    .get()
  if (!hasVec) {
    d.exec(
      `CREATE VIRTUAL TABLE vec_clip USING vec0(asset_id INTEGER PRIMARY KEY, embedding float[${CLIP_DIM}])`
    )
  }
  const version = Number(
    d.prepare("SELECT value FROM meta WHERE key='schema_version'").pluck().get() ?? 0
  )
  if (version < 1) {
    d.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', '1')").run()
  }
}

/** Run fn inside a transaction; nested calls reuse the outer one. */
export function tx<T>(fn: (d: DB) => T): T {
  const d = getDb()
  return d.transaction(fn)(d)
}

export const now = (): number => Date.now()
