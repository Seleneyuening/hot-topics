import { Hono } from 'hono'
import type { Env, PlatformResult } from './types'
import { readPlatforms, refreshScheduled } from './cache'
import { FEEDS } from './schedule'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', c.res.ok ? 'public, max-age=30' : 'no-store')
})

function limitResults(results: PlatformResult[], url: string) {
  const limit = Math.min(100, Math.floor(Number(new URL(url).searchParams.get('limit'))))
  return results.map((result) => limit > 0 ? { ...result, items: result.items.slice(0, limit) } : result)
}

const metadata = FEEDS.map(({ id, name, category, source }) => ({ id, name, category, source }))

app.get('/api/platforms', (c) => c.json({ code: 200, data: metadata }))

app.get('/api/all', async (c) => c.json(await overview(c.env, FEEDS, c.req.url)))

app.get('/api/category/:cat', async (c) => {
  const feeds = FEEDS.filter((feed) => feed.category === c.req.param('cat'))
  if (!feeds.length) return c.json({ code: 404, error: '未知分类' }, 404)
  return c.json(await overview(c.env, feeds, c.req.url))
})

async function overview(env: Env, feeds: typeof FEEDS, url: string) {
  const data = limitResults(await readPlatforms(env, feeds), url)
  const ok = data.filter((feed) => feed.status === 'fresh').length
  return {
    code: 200,
    timestamp: new Date().toISOString(),
    ok,
    failed: data.filter((feed) => feed.status === 'error' || feed.status === 'stale').length,
    count: data.length,
    data,
  }
}

app.get('/api/:platform', async (c) => {
  const feed = FEEDS.find(({ id }) => id === c.req.param('platform').toLowerCase())
  if (!feed) return c.json({ code: 404, error: '不支持的平台' }, 404)
  const [data] = limitResults(await readPlatforms(c.env, [feed]), c.req.url)
  return c.json({ code: 200, timestamp: new Date().toISOString(), data })
})

app.get('/healthz', (c) => {
  return c.json({ ok: Boolean(c.env.KV), version: 'nowtide-1', platforms: FEEDS.length, time: new Date().toISOString() })
})

app.get('/api', (c) => c.json({
  name: 'NowTide',
  collection: 'Cloudflare Workers cron',
  endpoints: ['/api/all', '/api/platforms', '/api/:platform', '/api/category/:cat', '/healthz'],
  repository: 'https://github.com/Seleneyuening/hot-topics',
}))

export default {
  fetch: app.fetch,
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshScheduled(env, event.cron, event.scheduledTime))
  },
}
