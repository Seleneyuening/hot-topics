import type { HotItem } from '../types'
import { UA_CHROME, getJson } from './utils'

/** 掘金·文章热榜(官方 API) */
export async function fetchJuejin(): Promise<HotItem[]> {
  const json = await getJson('https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://juejin.cn/hot/articles' },
  })
  const list: any[] = json?.data || []
  const items = list
    .map((v) => ({
      title: v?.content?.title || '',
      hot: v?.content_counter?.view ?? '',
      url: `https://juejin.cn/post/${v?.content?.content_id || ''}`,
      extra: { author: v?.author?.name || '' },
    }))
    .filter((i: HotItem) => !!i.title && !!i.url)
  if (!items.length) throw new Error('empty list')
  return items
}
