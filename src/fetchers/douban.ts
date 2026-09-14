import type { HotItem } from '../types'
import { UA_IOS, getText } from './utils'

/** 豆瓣电影·新片榜(官方页面服务端渲染) */
export async function fetchDoubanMovie(): Promise<HotItem[]> {
  const html = await getText('https://movie.douban.com/chart/', {
    headers: { 'User-Agent': UA_IOS, Referer: 'https://movie.douban.com/' },
  })
  const items: HotItem[] = []
  for (const tr of html.matchAll(/<tr class="item">([\s\S]*?)<\/tr>/g)) {
    const block = tr[1]
    const link = block.match(/<a[^>]+href="(https?:\/\/movie\.douban\.com\/subject\/\d+\/)"/)?.[1] || ''
    const title = block.match(/<a[^>]+title="([^"]+)"/)?.[1] || ''
    const score = block.match(/<span class="rating_nums">([\d.]+)<\/span>/)?.[1] || ''
    if (!link || !title) continue
    items.push({
      title: score ? `${title}（${score}分）` : title,
      hot: '',
      url: link,
    })
    if (items.length >= 25) break
  }
  if (!items.length) throw new Error('新片榜解析为空')
  return items
}
