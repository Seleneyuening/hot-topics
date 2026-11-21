import type { Env, HotItem, PlatformResult } from './types'
import { CRONS, FEEDS, isDue } from './schedule'

interface Entry {
  items: HotItem[]
  successAt: number | null
  attemptedAt: number
  error?: string
  failures: number
  retryAt?: number
  disabled?: boolean
}

interface Snapshot {
  tick: number
  entries: Record<string, Entry>
}

type Feed = (typeof FEEDS)[number]
const key = (shard: number) => `nowtide:v1:${shard}`

async function snapshot(kv: KVNamespace, shard: number) {
  return await kv.get<Snapshot>(key(shard), { type: 'json', cacheTtl: 30 })
}

const reads = new Map<number, { until: number; value: Snapshot | null }>()

async function readPublished(kv: KVNamespace, shard: number) {
  const cached = reads.get(shard)
  if (cached && cached.until > Date.now()) return cached.value
  const value = await snapshot(kv, shard)
  reads.set(shard, { until: Date.now() + 30_000, value })
  return value
}

function present(feed: Feed, entry?: Entry, storageError?: string): PlatformResult {
  const successAt = entry?.successAt
  const error = feed.paused ?? entry?.error ?? storageError
  const expiresAt = successAt == null ? null : successAt + feed.minutes * 60_000
  const stale = expiresAt !== null && (Boolean(error) || expiresAt <= Date.now())
  const status = stale ? 'stale' : error ? 'error' : successAt == null ? 'pending' : 'fresh'
  return {
    platform: feed.id,
    name: feed.name,
    category: feed.category,
    source: feed.source,
    source_link: feed.link,
    interval_minutes: feed.paused || entry?.disabled ? null : feed.minutes,
    update_time: successAt == null ? '' : new Date(successAt).toISOString(),
    attempted_at: entry ? new Date(entry.attemptedAt).toISOString() : null,
    expires_at: expiresAt == null ? null : new Date(expiresAt).toISOString(),
    retry_at: entry?.retryAt ? new Date(entry.retryAt).toISOString() : null,
    total: entry?.items.length ?? 0,
    items: entry?.items ?? [],
    status,
    stale,
    error,
  }
}

export async function readPlatforms(env: Env, feeds: Feed[]): Promise<PlatformResult[]> {
  const shards = [...new Set(feeds.filter((feed) => !feed.paused).map((feed) => feed.shard))]
  const results = new Map<number, { data: Snapshot | null; error?: string }>(await Promise.all(shards.map(async (shard) => {
    try {
      return [shard, { data: await readPublished(env.KV, shard) }] as const
    } catch (err) {
      console.error('snapshot-read', shard, String(err))
      return [shard, { data: reads.get(shard)?.value ?? null, error: '暂时无法读取榜单缓存' }] as const
    }
  })))
  return feeds.map((feed) => {
    const shard = results.get(feed.shard)
    return present(feed, shard?.data?.entries[feed.id], shard?.error)
  })
}

async function collect(feed: Feed, previous?: Entry): Promise<Entry> {
  const attemptedAt = Date.now()
  try {
    const items = (await feed.fetcher()).filter((item) => {
      return typeof item.title === 'string' && /^https?:\/\//i.test(item.url)
    }).slice(0, 50).map(({ title, url, hot }) => ({
      title: title.slice(0, 350),
      url,
      hot: typeof hot === 'number' || typeof hot === 'string' ? hot : '',
    }))
    if (!items.length) throw new Error('源站没有返回可用榜单')
    const successAt = Date.now()
    console.log('feed-success', feed.id, feed.source, items.length)
    return { items, successAt, attemptedAt, failures: 0 }
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 400)
    console.warn('feed-error', feed.id, error)
    const failures = (previous?.failures ?? 0) + 1
    const disabled = /HTTP (401|403|406|412|418|432|451)\b/.test(error)
    const base = /HTTP 429\b/.test(error) ? 60 : Math.max(10, feed.minutes)
    return {
      items: previous?.items ?? [],
      successAt: previous?.successAt ?? null,
      attemptedAt,
      error: disabled ? `${error} · 源站限制，已暂停自动抓取` : error,
      failures,
      disabled,
      retryAt: disabled ? undefined : attemptedAt + Math.min(360, base * 2 ** Math.min(failures - 1, 8)) * 60_000,
    }
  }
}

export async function refreshScheduled(env: Env, cron: string, scheduledTime: number) {
  const shard = CRONS.indexOf(cron)
  if (shard === -1) throw new Error(`Unexpected cron: ${cron}`)
  const tick = Math.floor(scheduledTime / 300_000)
  const previous = await snapshot(env.KV, shard)
  if (previous && previous.tick >= tick) return

  const entries = { ...previous?.entries }
  const due = FEEDS.filter((feed) => {
    const entry = entries[feed.id]
    const firstPriorityCheck = !entry && ['github', 'rednote'].includes(feed.id)
    return feed.shard === shard && !feed.paused && (firstPriorityCheck || isDue(feed, tick))
      && !entry?.disabled && (entry?.retryAt ?? 0) <= Date.now()
  })
  if (!due.length) return
  await Promise.all(due.map(async (feed) => {
    entries[feed.id] = await collect(feed, entries[feed.id])
  }))
  await env.KV.put(key(shard), JSON.stringify({ tick, entries }))
  reads.delete(shard)
}
