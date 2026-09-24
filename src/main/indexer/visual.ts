// Pure image-analysis helpers. No I/O. Unit-tested.

export interface Lab {
  l: number
  a: number
  b: number
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  let R = r / 255
  let G = g / 255
  let B = b / 255
  R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92
  G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92
  B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X)
  const fy = f(Y)
  const fz = f(Z)
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  )
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Dominant colors via k-means on a small RGB buffer (e.g. 64x64 = 4096 px).
 * Deterministic init (spread by luminance) so results are stable between runs.
 */
export function dominantColors(
  rgb: Uint8Array | Uint8ClampedArray,
  k = 5,
  iterations = 8
): { r: number; g: number; b: number; weight: number }[] {
  const n = rgb.length / 3
  if (n === 0) return []
  // init: sort sample indices by luminance and pick k evenly spaced pixels
  const idx = new Uint32Array(n)
  for (let i = 0; i < n; i++) idx[i] = i
  const lum = (i: number): number =>
    rgb[i * 3] * 0.299 + rgb[i * 3 + 1] * 0.587 + rgb[i * 3 + 2] * 0.114
  idx.sort((a, b) => lum(a) - lum(b))
  const centers: number[][] = []
  for (let c = 0; c < k; c++) {
    const i = idx[Math.floor(((c + 0.5) / k) * n)]
    centers.push([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]])
  }
  const assign = new Uint8Array(n)
  for (let it = 0; it < iterations; it++) {
    const sum = centers.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      const r = rgb[i * 3]
      const g = rgb[i * 3 + 1]
      const b = rgb[i * 3 + 2]
      let best = 0
      let bd = Infinity
      for (let c = 0; c < k; c++) {
        const dr = r - centers[c][0]
        const dg = g - centers[c][1]
        const db = b - centers[c][2]
        const d = dr * dr + dg * dg + db * db
        if (d < bd) {
          bd = d
          best = c
        }
      }
      assign[i] = best
      sum[best][0] += r
      sum[best][1] += g
      sum[best][2] += b
      sum[best][3]++
    }
    for (let c = 0; c < k; c++) {
      if (sum[c][3] > 0) {
        centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]]
      }
    }
  }
  const counts = new Array(k).fill(0)
  for (let i = 0; i < n; i++) counts[assign[i]]++
  return centers
    .map((c, i) => ({
      r: Math.round(c[0]),
      g: Math.round(c[1]),
      b: Math.round(c[2]),
      weight: counts[i] / n
    }))
    .filter((c) => c.weight > 0.015)
    .sort((a, b) => b.weight - a.weight)
}

/**
 * 64-bit perceptual hash (DCT-based, pHash). Input: 32x32 grayscale buffer.
 * Returns BigInt so it can be stored as SQLite int64.
 */
export function phash32(gray: Uint8Array | Uint8ClampedArray): bigint {
  const N = 32
  // DCT-II rows then cols on top-left 8x8 only (that's all we need)
  const cosTable: number[][] = []
  for (let u = 0; u < 8; u++) {
    cosTable.push([])
    for (let x = 0; x < N; x++) cosTable[u].push(Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)))
  }
  const rows: number[][] = []
  for (let y = 0; y < N; y++) {
    rows.push([])
    for (let u = 0; u < 8; u++) {
      let s = 0
      for (let x = 0; x < N; x++) s += gray[y * N + x] * cosTable[u][x]
      rows[y].push(s)
    }
  }
  const dct: number[] = []
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let s = 0
      for (let y = 0; y < N; y++) s += rows[y][u] * cosTable[v][y]
      dct.push(s)
    }
  }
  // median of the 63 AC coefficients (skip DC at index 0)
  const ac = dct.slice(1)
  const sorted = [...ac].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  let hash = 0n
  for (let i = 0; i < 64; i++) {
    hash <<= 1n
    if (i > 0 && dct[i] > median) hash |= 1n
  }
  // store as signed int64
  return BigInt.asIntN(64, hash)
}

export function hamming64(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b)
  let c = 0
  while (x) {
    x &= x - 1n
    c++
  }
  return c
}

/**
 * Cluster ids whose phash hamming distance <= threshold. Pigeonhole on 8 byte-chunks:
 * with threshold <= 7 at least one chunk must match exactly, so candidates come from buckets.
 */
export function duplicateClusters(
  items: { id: number; phash: bigint }[],
  threshold = 6
): number[][] {
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    let c = x
    while (parent.get(c) !== r) {
      const n = parent.get(c)!
      parent.set(c, r)
      c = n
    }
    return r
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const it of items) parent.set(it.id, it.id)
  const buckets = new Map<string, { id: number; phash: bigint }[]>()
  for (const it of items) {
    const u = BigInt.asUintN(64, it.phash)
    for (let c = 0; c < 8; c++) {
      const chunk = Number((u >> BigInt(c * 8)) & 0xffn)
      const key = `${c}:${chunk}`
      let arr = buckets.get(key)
      if (!arr) buckets.set(key, (arr = []))
      arr.push(it)
    }
  }
  const seen = new Set<string>()
  for (const arr of buckets.values()) {
    if (arr.length < 2 || arr.length > 500) continue
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key =
          arr[i].id < arr[j].id ? `${arr[i].id}-${arr[j].id}` : `${arr[j].id}-${arr[i].id}`
        if (seen.has(key)) continue
        seen.add(key)
        if (hamming64(arr[i].phash, arr[j].phash) <= threshold) union(arr[i].id, arr[j].id)
      }
    }
  }
  const groups = new Map<number, number[]>()
  for (const it of items) {
    const r = find(it.id)
    let g = groups.get(r)
    if (!g) groups.set(r, (g = []))
    g.push(it.id)
  }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a - b))
}
