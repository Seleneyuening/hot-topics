import type { Env, PlatformResult } from './types'
import { PLATFORM_MAP } from './registry'
import { md5 } from 'js-md5'

interface CacheEntry {
  fetchedAt: number
  /** 最近一次写入 KV 的时间(0 = 旧格式数据,重写后补齐) */
  savedAt: number
  /** 条目内容指纹,用于「变更才写」降低 KV 写入量 */
  hash: string
  data: PlatformResult
}

/** 一级缓存:同 Isolate 内存 */
const memory = new Map<string, CacheEntry>()
/** 防止同 Isolate 并发重复抓取(惊群) */
const inflight = new Map<string, Promise<PlatformResult>>()

const KV_PREFIX = 'hot:'
const KV_RETENTION_SEC = 86400
/** KV 宽限期:数据超过内存 TTL 但未超此值时直接返回(冷启动首请求免全量重抓) */
const KV_GRACE_MS = 30 * 60_000
/** 同平台 KV 写入最小间隔:控制写量在免费额度内(34 榜 × 24 次/天 ≈ 816 写) */
const KV_MIN_WRITE_INTERVAL_MS = 3600_000
/** cron 分批数:每 5 分钟刷一批,3 批轮转一圈,控制单次 scheduled 的子请求数 */
export const REFRESH_BATCHES = 3

function ttlSeconds(env?: Env): number {
  const n = Number(env?.CACHE_TTL)
  return Number.isFinite(n) && n > 0 ? n : 300
}

async function runFetch(id: string): Promise<PlatformResult> {
  const def = PLATFORM_MAP.get(id)
  if (!def) throw new Error(`Unknown platform: ${id}`)
  const items = await def.fetcher()
  return {
    platform: def.id,
    name: def.name,
    category: def.category,
    update_time: new Date().toISOString(),
    total: items.length,
    items,
  }
}

function entryHash(data: PlatformResult): string {
  return md5(JSON.stringify(data.items))
}

function normalizeEntry(raw: any): CacheEntry | null {
  if (!raw?.data || typeof raw.fetchedAt !== 'number') return null
  return { fetchedAt: raw.fetchedAt, savedAt: raw.savedAt ?? 0, hash: raw.hash ?? '', data: raw.data }
}

/** 内存 + KV 双写;KV 侧「变更才写 + 最小间隔限流」以适配免费写额度。
 *  kvEntry:调用方已读取的旧条目(省一次 KV 读,子请求限额宝贵);未传时内部补读。 */
async function persist(env: Env | undefined, id: string, data: PlatformResult, kvEntry?: CacheEntry | null): Promise<void> {
  const hash = entryHash(data)
  memory.set(id, { fetchedAt: Date.now(), savedAt: kvEntry?.savedAt ?? 0, hash, data })
  if (!env?.KV) return
  try {
    const old = kvEntry === undefined ? await readKv(env, id) : kvEntry
    if (old && old.hash === hash) return // 内容没变,跳过
    if (old?.savedAt && Date.now() - old.savedAt < KV_MIN_WRITE_INTERVAL_MS) return // 写入限流
    const toSave: CacheEntry = { fetchedAt: Date.now(), savedAt: Date.now(), hash, data }
    await env.KV.put(`${KV_PREFIX}${id}`, JSON.stringify(toSave), { expirationTtl: KV_RETENTION_SEC })
  } catch {
    // KV 写失败不影响返回
  }
}

async function readKv(env: Env | undefined, id: string): Promise<CacheEntry | null> {
  if (!env?.KV) return null
  try {
    const raw = await env.KV.get(`${KV_PREFIX}${id}`)
    if (!raw) return null
    return normalizeEntry(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function getPlatform(env: Env | undefined, id: string, opts?: { force?: boolean }): Promise<PlatformResult> {
  const now = Date.now()
  const mem = memory.get(id)

  if (!opts?.force && mem && now - mem.fetchedAt < ttlSeconds(env) * 1000) return mem.data

  // 二级缓存:KV(跨实例共享)。新鲜度以数据自身的抓取时间(update_time)为准:
  // 超过内存 TTL 但在宽限期内的旧数据直接返回,避免冷流量全量重抓打爆子请求限额
  let kvEntry: CacheEntry | null = null
  if (!opts?.force) {
    kvEntry = await readKv(env, id)
    if (kvEntry) {
      const dataTime = Date.parse(kvEntry.data.update_time) || 0
      if (now - dataTime < ttlSeconds(env) * 1000 + KV_GRACE_MS) {
        memory.set(id, { ...kvEntry, fetchedAt: dataTime || kvEntry.fetchedAt })
        return kvEntry.data
      }
    }
  }

  const running = inflight.get(id)
  if (running) return running

  const task = (async (): Promise<PlatformResult> => {
    try {
      const data = await runFetch(id)
      await persist(env, id, data, kvEntry)
      return data
    } catch (err) {
      // 降级:优先返回过期缓存(标记 stale),都没有才如实报错
      const stale = mem ?? (kvEntry ?? (opts?.force ? await readKv(env, id) : null))
      if (stale) return { ...stale.data, stale: true }
      const def = PLATFORM_MAP.get(id)!
      return {
        platform: id,
        name: def.name,
        category: def.category,
        update_time: new Date().toISOString(),
        total: 0,
        items: [],
        error: err instanceof Error ? err.message : String(err),
      }
    } finally {
      inflight.delete(id)
    }
  })()

  inflight.set(id, task)
  return task
}

/** 分批刷新(Workers 定时任务):每批约 1/REFRESH_BATCHES 个平台,
 *  控制单次 scheduled 的子请求数在免费额度内 */
export async function refreshBatch(env: Env | undefined, batch: number): Promise<void> {
  const ids = [...PLATFORM_MAP.keys()].filter((_, i) => i % REFRESH_BATCHES === batch % REFRESH_BATCHES)
  await Promise.all(ids.map((id) => getPlatform(env, id, { force: true })))
}
