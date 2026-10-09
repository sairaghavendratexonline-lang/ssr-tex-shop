import { fetchWithTimeout } from "@/lib/network/fetchWithTimeout";

export type SizePreviewOption = {
  size: string;
  qty: number;
};

export type SizePreviewConfig = {
  enabled: boolean;
  options: SizePreviewOption[];
};

const EMPTY: SizePreviewConfig = { enabled: false, options: [] };
const BATCH_WINDOW_MS = 16;
const MAX_IDS_PER_REQUEST = 50;
const CACHE_TTL_MS = 5 * 60_000;

type Waiter = (config: SizePreviewConfig) => void;

const cache = new Map<string, { config: SizePreviewConfig; at: number }>();
const inflight = new Map<string, Promise<SizePreviewConfig>>();
let queue = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function readCachedSizePreview(
  productId: string,
): SizePreviewConfig | undefined {
  const hit = cache.get(productId);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(productId);
    return undefined;
  }
  return hit.config;
}

async function fetchChunk(ids: string[]) {
  try {
    const res = await fetchWithTimeout(
      `/api/products/size-config?productIds=${ids.map(encodeURIComponent).join(",")}`,
    );
    if (!res.ok) return {} as Record<string, SizePreviewConfig>;
    return (await res.json()) as Record<string, SizePreviewConfig>;
  } catch {
    return {} as Record<string, SizePreviewConfig>;
  }
}

async function flush() {
  timer = null;
  const pending = queue;
  queue = new Map();
  const ids = [...pending.keys()].sort();

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    chunks.push(ids.slice(i, i + MAX_IDS_PER_REQUEST));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const payload = await fetchChunk(chunk);
      const now = Date.now();
      for (const id of chunk) {
        const config = payload[id] ?? EMPTY;
        if (payload[id]) cache.set(id, { config, at: now });
        inflight.delete(id);
        pending.get(id)?.forEach((resolve) => resolve(config));
      }
    }),
  );
}

/** Coalesces size-preview lookups from cards rendered together into one request. */
export function loadSizePreview(productId: string): Promise<SizePreviewConfig> {
  const cached = readCachedSizePreview(productId);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(productId);
  if (existing) return existing;

  const promise = new Promise<SizePreviewConfig>((resolve) => {
    const waiters = queue.get(productId) ?? [];
    waiters.push(resolve);
    queue.set(productId, waiters);
    if (!timer) timer = setTimeout(() => void flush(), BATCH_WINDOW_MS);
  });
  inflight.set(productId, promise);
  return promise;
}

export function resetSizePreviewBatchForTests() {
  cache.clear();
  inflight.clear();
  queue = new Map();
  if (timer) clearTimeout(timer);
  timer = null;
}
