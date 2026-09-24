// Shared domain types. No runtime imports allowed here (used by main, preload and renderer).

export type FileStatus = 'ok' | 'missing' | 'offline'
export type FileKind = 'image' | 'video' | 'other'

export interface Root {
  id: number
  path: string
  name: string
  volumeUuid: string | null
  online: boolean
  addedAt: number
  lastScanAt: number | null
  fileCount: number
}

/** Minimal payload for grid rendering. Keep tiny: 10k of these travel over IPC. */
export interface AssetTile {
  id: number
  /** pixel width/height of the *primary* file (after orientation). 0 when unknown yet */
  w: number
  h: number
  /** 0 = none, 1 red, 2 yellow, 3 green, 4 blue, 5 purple */
  label: number
  /** thumb generation state: 0 none, 1 ready, -1 failed */
  thumb: number
  /** bit flags: 1 raw+jpg pair, 2 offline, 4 missing, 8 video */
  flags: number
  takenAt: number | null
}

export const AssetFlag = {
  Pair: 1,
  Offline: 2,
  Missing: 4,
  Video: 8
} as const

export interface AssetDetail extends AssetTile {
  name: string
  dir: string
  rootId: number
  files: AssetFile[]
  meta: AssetMeta | null
  keywords: string[]
  dominant: DominantColor[]
  hasEmbedding: boolean
}

export interface AssetFile {
  id: number
  path: string
  ext: string
  size: number
  mtime: number
  status: FileStatus
  isRaw: boolean
}

export interface AssetMeta {
  width: number
  height: number
  orientation: number
  takenAt: number | null
  camera: string | null
  lens: string | null
  focal: number | null
  iso: number | null
  aperture: number | null
  shutter: number | null
  lat: number | null
  lon: number | null
}

export interface DominantColor {
  r: number
  g: number
  b: number
  /** 0..1 share of pixels */
  weight: number
}

export type LayoutKind = 'justified' | 'grid' | 'masonry' | 'filmstrip'

export type SortKey = 'takenAt' | 'name' | 'mtime' | 'size' | 'random'

export interface LibraryFilter {
  rootId?: number
  /** directory prefix (absolute). Implies rootId. */
  dir?: string
  text?: string
  labels?: number[]
  keywords?: string[]
  collectionId?: number
  /** hex color like "#ff8800" */
  color?: string
  /** asset id: rank by CLIP similarity */
  similarTo?: number
  /** show only assets that belong to a near-duplicate cluster */
  duplicatesOnly?: boolean
  includeOffline?: boolean
  sort?: SortKey
  sortDir?: 'asc' | 'desc'
}

export interface Collection {
  id: number
  name: string
  /** null = manual collection */
  smartFilter: LibraryFilter | null
  count: number
  createdAt: number
}

export type JobKind = 'meta' | 'thumb' | 'visual' | 'embed'
export type JobState = 'pending' | 'running' | 'done' | 'failed'

export interface IndexProgress {
  scanning: boolean
  /** files discovered in current scan */
  scanned: number
  pending: Record<JobKind, number>
  done: Record<JobKind, number>
  failed: Record<JobKind, number>
  /** assets/sec over last 5s */
  rate: number
}

export interface ThumbSize {
  size: 256 | 1024 | 2560
}

export interface Keyword {
  id: number
  name: string
  count: number
}

export const LABEL_COLORS: Record<number, { name: string; hex: string }> = {
  1: { name: 'Red', hex: '#ef4444' },
  2: { name: 'Yellow', hex: '#eab308' },
  3: { name: 'Green', hex: '#22c55e' },
  4: { name: 'Blue', hex: '#3b82f6' },
  5: { name: 'Purple', hex: '#a855f7' }
}

export const IMAGE_EXTS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'tif',
  'tiff',
  'gif',
  'avif',
  'bmp'
])
export const RAW_EXTS = new Set([
  'arw',
  'nef',
  'dng',
  'cr2',
  'cr3',
  'raf',
  'orf',
  'rw2',
  'pef',
  'srw',
  'raw'
])
export const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'avi', 'mkv'])
