// worker_threads entry: CLIP embeddings (image + text) via @huggingface/transformers (ONNX runtime).
import { parentPort, workerData } from 'worker_threads'

const MODEL = 'Xenova/clip-vit-base-patch32'

type Req = { id: number; kind: 'image'; thumb: string } | { id: number; kind: 'text'; text: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let T: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vision: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let processor: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let textModel: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenizer: any = null
let loading: Promise<void> | null = null

function emit(progress: number, done: boolean, error?: string): void {
  parentPort!.postMessage({ event: { type: 'model', name: MODEL, progress, done, error } })
}

async function load(): Promise<void> {
  if (vision) return
  if (loading) return loading
  loading = (async () => {
    T = await import('@huggingface/transformers')
    T.env.cacheDir = (workerData as { modelsDir: string }).modelsDir
    T.env.allowLocalModels = true
    let last = 0
    const progress_callback = (p: { status: string; progress?: number }): void => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        const v = Math.round(p.progress)
        if (v !== last) {
          last = v
          emit(v, false)
        }
      }
    }
    try {
      const opts = { progress_callback, dtype: 'fp32', device: 'cpu' }
      ;[processor, vision, tokenizer, textModel] = await Promise.all([
        T.AutoProcessor.from_pretrained(MODEL, opts),
        T.CLIPVisionModelWithProjection.from_pretrained(MODEL, opts),
        T.AutoTokenizer.from_pretrained(MODEL, opts),
        T.CLIPTextModelWithProjection.from_pretrained(MODEL, opts)
      ])
      emit(100, true)
    } catch (e) {
      emit(0, true, (e as Error).message)
      throw e
    }
  })()
  return loading
}

function normalize(data: Float32Array): number[] {
  let n = 0
  for (const v of data) n += v * v
  n = Math.sqrt(n) || 1
  return Array.from(data, (v) => v / n)
}

async function embedImage(thumb: string): Promise<number[]> {
  await load()
  const image = await T.RawImage.read(thumb)
  const inputs = await processor(image)
  const out = await vision(inputs)
  return normalize(out.image_embeds.data as Float32Array)
}

async function embedText(text: string): Promise<number[]> {
  await load()
  const inputs = tokenizer([text], { padding: true, truncation: true })
  const out = await textModel(inputs)
  return normalize(out.text_embeds.data as Float32Array)
}

parentPort!.on('message', async (req: Req) => {
  try {
    const embedding = req.kind === 'image' ? await embedImage(req.thumb) : await embedText(req.text)
    parentPort!.postMessage({ id: req.id, ok: true, result: { embedding } })
  } catch (e) {
    parentPort!.postMessage({ id: req.id, ok: false, error: (e as Error).message ?? String(e) })
  }
})
