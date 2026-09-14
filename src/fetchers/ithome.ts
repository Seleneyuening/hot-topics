import type { HotItem } from '../types'
import { UA_CHROME, getText } from './utils'

/** 通用 RSS/Atom 解析:CDATA 与转义标题都支持 */
export function parseRss(xml: string, limit = 50): HotItem[] {
  const items: HotItem[] = []
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/g) || []
  for (const block of blocks) {
    const titleMatch = block.match(
      /<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i,
    )
    // 标准 RSS 用 <link>,VOA 等 Pangea 站点把文章地址放在 <guid>
    const linkMatch = block.match(
      /<link[^>]*href="(https?:\/\/[^"]+)"[^>]*\/?>(?:\s*<\/link>)?|<link[^>]*>(?:<!\[CDATA\[)?\s*(https?:\/\/[^\s<]+?)\s*(?:\]\]>)?<\/link>/i,
    )
    const guidMatch = block.match(/<guid[^>]*>(?:<!\[CDATA\[)?\s*(https?:\/\/[^\s<]+?)\s*(?:\]\]>)?<\/guid>/i)
    const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? '').replace(/\s+/g, ' ').trim()
    const url = linkMatch?.[1] || linkMatch?.[2] || guidMatch?.[1] || ''
    // 过滤过短标题(如 DW feed 首条的官方推广条目「DW」)
    if (!title || title.length < 4 || !url) continue
    items.push({ title, hot: '', url })
    if (items.length >= limit) break
  }
  return items
}

/** IT之家官方 RSS */
export async function fetchIthome(): Promise<HotItem[]> {
  const xml = await getText('https://www.ithome.com/rss/', { headers: { 'User-Agent': UA_CHROME } })
  const items = parseRss(xml)
  if (!items.length) throw new Error('RSS 解析为空')
  return items
}
