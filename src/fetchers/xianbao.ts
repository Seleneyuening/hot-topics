import type { HotItem } from '../types'
import { UA_CHROME, getText } from './utils'

/**
 * 线报酷(new.xianbao.fun)最新线报:Z-BlogPHP 服务端渲染站,
 * 解析首页 new-post 列表的 <li class="article-list"> 条目。
 */
export async function fetchXianbao(): Promise<HotItem[]> {
  const html = await getText('https://new.xianbao.fun/', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://new.xianbao.fun/' },
  })
  const items: HotItem[] = []
  const seen = new Set<string>()
  for (const li of html.matchAll(/<li class="article-list">([\s\S]*?)<\/li>/g)) {
    const a = li[1].match(/<a[^>]+href="((?:https?:\/\/new\.xianbao\.fun)?\/[a-z0-9-]+\/\d+\.html)"[^>]*>([\s\S]*?)<\/a>/)
    if (!a) continue
    const title = a[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    if (!title || seen.has(a[1])) continue
    seen.add(a[1])
    const url = a[1].startsWith('http') ? a[1] : `https://new.xianbao.fun${a[1]}`
    const time = li[1].match(/<time[^>]*title="([\d\- :]+)"/)?.[1] || ''
    const cate = a[0].match(/data-catename="([^"]*)"/)?.[1] || ''
    const louzhu = a[0].match(/data-louzhu="([^"]*)"/)?.[1] || ''
    items.push({
      title,
      hot: '',
      url,
      extra: { ...(cate ? { cate } : {}), ...(louzhu ? { louzhu } : {}), ...(time ? { time } : {}) },
    })
    if (items.length >= 50) break
  }
  if (!items.length) throw new Error('线报列表解析为空')
  return items
}
