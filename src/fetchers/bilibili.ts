import type { HotItem } from '../types'
import { UA_CHROME, getText } from './utils'
import { fetchTophubBoard } from './tophub'

/** B站对数据中心 IP 做无 Cookie 风控(HTTP 412),请求需携带 buvid3 */
let spiCookieCache: { cookie: string; expires: number } | null = null

/** 通过 B站官方 finger/spi 接口换取真实 buvid3/buvid4(缓存 1 小时),失败则退回随机值 */
async function biliCookie(): Promise<string> {
  const now = Date.now()
  if (spiCookieCache && now < spiCookieCache.expires) return spiCookieCache.cookie
  let cookie = `buvid3=${crypto.randomUUID()}infoc; b_nut=${Math.floor(now / 1000)}`
  try {
    const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.bilibili.com/' },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const json: any = await res.json()
      const b3 = json?.data?.b_3
      const b4 = json?.data?.b_4
      if (b3) cookie = `buvid3=${encodeURIComponent(b3)}; buvid4=${encodeURIComponent(b4 || '')}; b_nut=${Math.floor(now / 1000)}`
    }
  } catch {
    // 用随机兜底 cookie 继续
  }
  spiCookieCache = { cookie, expires: now + 3600_000 }
  return cookie
}

async function getBiliJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.bilibili.com/', Cookie: await biliCookie() },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} (${new URL(url).host})`)
  return res.json()
}

/** 站内热搜词(s.search 子站,风控较宽松) */
async function viaHotword(): Promise<HotItem[]> {
  const json = await getBiliJson('https://s.search.bilibili.com/main/hotword?limit=50')
  const list: any[] = json?.top_list || json?.list || []
  const items = list
    .map((item) => ({
      title: item.show_name || item.keyword || '',
      hot: item.heat_score || '',
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword || item.show_name || '')}`,
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}

/** Web 热搜词(wbi 接口) */
async function viaSearchSquare(): Promise<HotItem[]> {
  const json = await getBiliJson('https://api.bilibili.com/x/web-interface/wbi/search/square?limit=50')
  const list: any[] = json?.data?.trending?.list || []
  const items = list
    .map((item) => ({
      title: item.keyword || item.show_name || '',
      hot: '',
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword || '')}`,
      extra: { icon: item.icon || '' },
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}

/** App 热搜词,过滤商业推广词 */
async function viaAppTrending(): Promise<HotItem[]> {
  const json = await getBiliJson('https://app.bilibili.com/x/v2/search/trending/ranking?limit=50')
  const list: any[] = json?.data?.list || []
  const items = list
    .filter((item) => Number(item.is_commercial) === 0)
    .map((item) => ({
      title: item.keyword || item.show_name || '',
      hot: item.heat_score ?? '',
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword || '')}`,
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}

/** tophub 哔哩哔哩日榜(best-effort 最终兜底,数据本身仍是 B站官方榜) */
async function viaTophub(): Promise<HotItem[]> {
  return fetchTophubBoard('74KvxwokxM')
}

function mapVideoList(list: any[]): HotItem[] {
  return list.map((item) => ({
    title: item.title || '',
    hot: item.stat?.view ? `${Math.round(item.stat.view / 10000)}万播放` : '',
    url: item.short_link_v2 || `https://www.bilibili.com/video/${item.bvid}`,
    extra: { author: item.owner?.name, pic: item.pic },
  }))
}

/** 全站排行榜 */
async function viaRanking(): Promise<HotItem[]> {
  const json = await getBiliJson('https://api.bilibili.com/x/web-interface/ranking/v2')
  const items = mapVideoList(json?.data?.list || [])
  if (!items.length) throw new Error('empty list')
  return items
}

async function tryChannels(channels: Array<{ name: string; run: () => Promise<HotItem[]> }>): Promise<HotItem[]> {
  const errors: string[] = []
  for (const ch of channels) {
    try {
      return await ch.run()
    } catch (err) {
      errors.push(`${ch.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(errors.join(' | '))
}

/** B 站热搜词 */
export async function fetchBilibili(): Promise<HotItem[]> {
  return tryChannels([
    { name: 'hotword', run: viaHotword },
    { name: 'web-search-square', run: viaSearchSquare },
    { name: 'app-trending', run: viaAppTrending },
    { name: 'tophub', run: viaTophub },
  ])
}

/** B 站热门视频榜:api.bilibili.com 对 Cloudflare 出口 IP 全量 412(2026-09 实测),
 *  因此主源用 tophub 的哔哩哔哩全站日榜(数据即 B站官方视频榜),官方接口作备选。 */
export async function fetchBilibiliVideo(): Promise<HotItem[]> {
  return tryChannels([
    { name: 'tophub', run: () => fetchTophubBoard('74KvxwokxM') },
    {
      name: 'popular',
      run: async () => {
        const json = await getBiliJson('https://api.bilibili.com/x/web-interface/popular')
        const items = mapVideoList(json?.data?.list || [])
        if (!items.length) throw new Error('empty list')
        return items
      },
    },
    { name: 'ranking-v2', run: viaRanking },
  ])
}
