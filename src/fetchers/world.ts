import type { HotItem } from '../types'
import { UA_CHROME, firstOk, getText } from './utils'
import { parseRss } from './ithome'

/** 美国之音(中文)官方 RSS。VOA 的 Pangea CMS feed 地址为随机串,
 *  内置已知候选,失败时从 rssfeeds 索引页自动发现真实 feed 地址。 */
export async function fetchVoa(): Promise<HotItem[]> {
  return firstOk([
    {
      name: 'known-feed',
      run: async () => {
        const xml = await getText('https://www.voachinese.com/api/zrqiteyesu', { headers: { 'User-Agent': UA_CHROME } })
        const items = parseRss(xml, 30)
        if (!items.length) throw new Error('RSS 解析为空')
        return items
      },
    },
    {
      name: 'rssfeeds-discovery',
      run: async () => {
        // Pangea CMS 的 feed key 会轮换,从两个官方索引页扫描全部 /api/<key> 模式
        const pages = ['https://www.voachinese.com/rssfeeds', 'https://www.voanews.com/rssfeeds']
        const keys = new Set<string>()
        for (const page of pages) {
          try {
            const html = await getText(page, { headers: { 'User-Agent': UA_CHROME } })
            // Pangea feed key 含连字符,如 zprtie-ttp
            for (const m of html.matchAll(/(?:https?:\/\/(?:www\.)?(?:voachinese|voanews)\.com)?\/api\/([a-z0-9][a-z0-9-]{4,24})/g)) {
              keys.add(m[1])
            }
          } catch {
            // 单个索引页失败不影响其他
          }
        }
        if (!keys.size) throw new Error('索引页未发现 feed key')
        const errors: string[] = []
        for (const key of [...keys].slice(0, 8)) {
          try {
            const xml = await getText(`https://www.voachinese.com/api/${key}`, { headers: { 'User-Agent': UA_CHROME } })
            const items = parseRss(xml, 30)
            if (items.length >= 5) return items
            errors.push(`${key}: 仅 ${items.length} 条`)
          } catch (err) {
            errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        throw new Error(errors.join(' | ') || '发现 feed 均无数据')
      },
    },
  ])
}

/** BBC 中文网官方 RSS(简体,备选繁体) */
export async function fetchBbc(): Promise<HotItem[]> {
  return firstOk([
    {
      name: 'simp',
      run: async () => {
        const xml = await getText('https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', { headers: { 'User-Agent': UA_CHROME } })
        const items = parseRss(xml, 30)
        if (!items.length) throw new Error('RSS 解析为空')
        return items
      },
    },
    {
      name: 'trad',
      run: async () => {
        const xml = await getText('https://feeds.bbci.co.uk/zhongwen/trad/rss.xml', { headers: { 'User-Agent': UA_CHROME } })
        const items = parseRss(xml, 30)
        if (!items.length) throw new Error('RSS 解析为空')
        return items
      },
    },
  ])
}

/** 德国之声中文官方 RSS */
export async function fetchDw(): Promise<HotItem[]> {
  return firstOk([
    {
      name: 'rdf',
      run: async () => {
        const xml = await getText('https://rss.dw.com/rdf/rss-chi-all', { headers: { 'User-Agent': UA_CHROME } })
        const items = parseRss(xml, 30)
        if (!items.length) throw new Error('RSS 解析为空')
        return items
      },
    },
    {
      name: 'xml',
      run: async () => {
        const xml = await getText('https://rss.dw.com/xml/rss-chi-all', { headers: { 'User-Agent': UA_CHROME } })
        const items = parseRss(xml, 30)
        if (!items.length) throw new Error('RSS 解析为空')
        return items
      },
    },
  ])
}

/** 法广中文官方 RSS(备选英文版) */
export async function fetchRfi(): Promise<HotItem[]> {
  return firstOk([
    {
      name: 'cn',
      run: async () => {
        const xml = await getText('https://www.rfi.fr/cn/rss', { headers: { 'User-Agent': UA_CHROME } })
        const items = parseRss(xml, 30)
        if (!items.length) throw new Error('RSS 解析为空')
        return items
      },
    },
    {
      name: 'en',
      run: async () => {
        const xml = await getText('https://www.rfi.fr/en/rss', { headers: { 'User-Agent': UA_CHROME } })
        const items = parseRss(xml, 30)
        if (!items.length) throw new Error('RSS 解析为空')
        return items
      },
    },
  ])
}

/** 联合早报·国际新闻:官方页面服务端渲染,文章链接特征为 /news/<栏目>/story日期-编号 */
export async function fetchZaobao(): Promise<HotItem[]> {
  const html = await getText('https://www.zaobao.com/news/world', {
    headers: { 'User-Agent': UA_CHROME, Accept: 'text/html' },
  })
  const items: HotItem[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/<a[^>]+href="(\/news\/[a-z-]+\/story\d{8}-\d+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const title = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    if (title.length < 8 || seen.has(m[1])) continue
    seen.add(m[1])
    items.push({ title, hot: '', url: `https://www.zaobao.com${m[1]}` })
    if (items.length >= 30) break
  }
  if (!items.length) throw new Error('页面解析为空')
  return items
}
