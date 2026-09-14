import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, PlatformResult } from './types'
import { PLATFORMS, PLATFORM_MAP } from './registry'
import { getPlatform, refreshBatch, REFRESH_BATCHES } from './cache'

const VERSION = '3.0.0'

const app = new Hono<{ Bindings: Env }>()

function parseLimit(url: string): number {
  const raw = Number(new URL(url).searchParams.get('limit'))
  if (!Number.isFinite(raw) || raw <= 0) return 0 // 0 = 不截断
  return Math.min(Math.floor(raw), 100)
}

/** API Key 鉴权:API_KEYS 未配置时不启用;支持 ?key= / X-API-Key / Authorization: Bearer / 浏览器会话 Cookie */
async function authorized(c: { env?: Env; req: { url: string; header: (name: string) => string | undefined } }): Promise<boolean> {
  const validKeys = (c.env?.API_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!validKeys.length) return true
  const provided =
    new URL(c.req.url).searchParams.get('key') || c.req.header('X-API-Key') || (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (provided && validKeys.includes(provided.trim())) return true
  // 浏览器正常访问:页面加载时种下签名会话 Cookie(24h),验签通过即免 Key
  const cookie = c.req.header('Cookie') || ''
  const session = cookie.match(/(?:^|;\s*)hts=([^;]+)/)?.[1]
  if (!session) return false
  const dot = session.lastIndexOf('.')
  if (dot <= 0) return false
  const expStr = session.slice(0, dot)
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  return session.slice(dot + 1) === (await hmacHex(validKeys[0], expStr))
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 生成 HMAC 签名的会话令牌:<过期时间>.<签名>(无状态,无需存储) */
async function makeSessionToken(secret: string): Promise<string> {
  const exp = String(Date.now() + 86400_000)
  return `${exp}.${await hmacHex(secret, exp)}`
}

/** 给响应种会话 Cookie(仅当启用了鉴权) */
async function withSessionCookie(c: { env?: Env; header: (name: string, value: string | undefined) => void }, res: Response): Promise<Response> {
  const secret = (c.env?.API_KEYS || '').split(',')[0]?.trim()
  if (!secret) return res
  const token = await makeSessionToken(secret)
  const out = new Response(res.body, res)
  out.headers.append('Set-Cookie', `hts=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`)
  return out
}

app.use('/api/*', async (c, next) => {
  const mw = cors({ origin: c.env?.CORS_ORIGIN || '*' })
  await mw(c, next)
  // 让浏览器与边缘节点缓存片刻,降低源站压力
  c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
})

// 鉴权中间件必须在 CORS 之后(OPTIONS 预检放行)、业务路由之前
app.use('/api/*', async (c, next) => {
  if (!(await authorized(c))) {
    c.header('Cache-Control', 'no-store')
    return c.json(
      {
        code: 401,
        error: '缺少或无效的 API Key',
        hint: '追加 ?key=你的Key,或请求头 X-API-Key / Authorization: Bearer <key>;Key 由部署者配置(API_KEYS)',
      },
      401,
    )
  }
  await next()
})

function withLimit(r: PlatformResult, limit: number): PlatformResult {
  if (!limit || r.items.length <= limit) return r
  return { ...r, items: r.items.slice(0, limit) }
}

app.get('/api/platforms', (c) => {
  return c.json({
    code: 200,
    data: PLATFORMS.map(({ id, name, category, source }) => ({ id, name, category, source })),
  })
})

app.get('/api/all', async (c) => {
  const limit = parseLimit(c.req.url)
  const results = await Promise.all(PLATFORMS.map((p) => getPlatform(c.env, p.id)))
  const data = results.map((r) => withLimit(r, limit))
  const ok = data.filter((r) => !r.error).length
  return c.json({
    code: 200,
    timestamp: new Date().toISOString(),
    ok,
    failed: data.length - ok,
    count: data.length,
    data,
  })
})

/** 按分类聚合:平台多时建议用此端点代替 /api/all(免费版 Workers 单请求 50 子请求上限) */
app.get('/api/category/:cat', async (c) => {
  const cat = decodeURIComponent(c.req.param('cat'))
  const defs = PLATFORMS.filter((p) => p.category === cat)
  if (!defs.length) {
    return c.json({ code: 404, error: `未知分类: ${cat}`, hint: 'GET /api/platforms 查看全部分类' }, 404)
  }
  const limit = parseLimit(c.req.url)
  const results = await Promise.all(defs.map((p) => getPlatform(c.env, p.id)))
  const data = results.map((r) => withLimit(r, limit))
  const ok = data.filter((r) => !r.error).length
  return c.json({
    code: 200,
    timestamp: new Date().toISOString(),
    ok,
    failed: data.length - ok,
    count: data.length,
    data,
  })
})

app.get('/api/:platform', async (c) => {
  const id = c.req.param('platform').toLowerCase()
  const def = PLATFORM_MAP.get(id)
  if (!def) {
    return c.json({ code: 404, error: `不支持的平台: ${id}`, hint: 'GET /api/platforms 查看全部平台' }, 404)
  }
  const limit = parseLimit(c.req.url)
  const result = await getPlatform(c.env, id, { force: new URL(c.req.url).searchParams.has('refresh') })
  return c.json(
    {
      code: result.error ? 502 : 200,
      timestamp: new Date().toISOString(),
      data: withLimit(result, limit),
    },
    result.error ? 502 : 200,
  )
})

app.get('/healthz', (c) => {
  return c.json({ ok: true, version: VERSION, platforms: PLATFORMS.length, time: new Date().toISOString() })
})

// API 摘要(仅当没有静态资源可回退时使用,即 Workers 纯 API 部署)
const API_INFO = {
  name: 'hot-topics-gateway',
  version: VERSION,
  description: '全网热点原生抓取网关 · 数据直连各平台官方接口 · 自托管可维护 · API Key 鉴权',
  auth: {
    enabled: '当配置 API_KEYS 环境变量后,/api/* 需要鉴权',
    usage: '追加 ?key=你的Key,或请求头 X-API-Key / Authorization: Bearer <key>',
  },
  endpoints: {
    all: 'GET /api/all?limit=N',
    platform: 'GET /api/:platform?limit=N (refresh=1 强制刷新)',
    platforms: 'GET /api/platforms',
    health: 'GET /healthz',
  },
  platforms: PLATFORMS.map(({ id, name, category }) => ({ id, name, category })),
}

app.get('/api', (c) => c.json(API_INFO))

// Workers 纯 API 部署:根路径返回 API 摘要;Pages 部署:回退到静态资源
// 两种情况都种下会话 Cookie,让浏览器正常访问免 Key
app.get('*', async (c) => {
  const res = c.env?.ASSETS ? await c.env.ASSETS.fetch(c.req.raw) : c.json(API_INFO)
  return withSessionCookie(c, res)
})

export default {
  fetch: app.fetch,
  /** Workers 定时任务(cron):分批预热缓存并写入 KV,控制单次子请求数 */
  scheduled(event: { scheduledTime: number }, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    // */5 触发,按触发时间的分钟数把平台分成 REFRESH_BATCHES 批轮转刷新
    const minute = new Date(event.scheduledTime).getUTCMinutes()
    const batch = Math.floor(minute / 5) % REFRESH_BATCHES
    ctx.waitUntil(refreshBatch(env, batch))
  },
}
