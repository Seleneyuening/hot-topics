import type { HotItem } from '../types'
import { UA_CHROME, getText, stripTags } from './utils'

/**
 * X(推特)热榜。X 官方趋势接口需要登录态,这里抓取 trends24.in
 * (服务端渲染的 X 趋势聚合页,首张卡为当前小时的全球实时趋势)作为 best-effort 兜底。
 */
export async function fetchXTrends(): Promise<HotItem[]> {
  const html = await getText('https://trends24.in/', { headers: { 'User-Agent': UA_CHROME } })
  const card = html.match(/<ol[^>]*class="?trend-card__list"?[^>]*>([\s\S]*?)<\/ol>/)?.[1]
  if (!card) throw new Error('trends24 页面无趋势卡片')

  const items: HotItem[] = []
  for (const li of card.matchAll(/<li>[\s\S]*?<\/li>/g)) {
    const a = li[0].match(/<a[^>]+href="https:\/\/(?:twitter|x)\.com\/search\?[^"]*"[^>]*class="?trend-link"?[^>]*>([\s\S]*?)<\/a>/)
    if (!a) continue
    const title = stripTags(a[1])
    if (!title) continue
    const count = li[0].match(/tweet-count[^>]*data-count="([^"]*)"/)?.[1] || ''
    items.push({
      title,
      hot: count.replace(/\btweets?/i, '').trim(),
      url: `https://x.com/search?q=${encodeURIComponent(title)}`,
    })
    if (items.length >= 30) break
  }
  if (!items.length) throw new Error('趋势解析为空')
  return items
}
