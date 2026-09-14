import type { HotItem } from '../types'
import { getJson } from './utils'

/** V2EX·最热主题(官方 API) */
export async function fetchV2ex(): Promise<HotItem[]> {
  const list = await getJson<any[]>('https://www.v2ex.com/api/topics/hot.json', {
    headers: { 'User-Agent': 'hot-topics-gateway', Referer: 'https://www.v2ex.com/' },
  })
  const items = (list || [])
    .map((v) => ({
      title: v.title || '',
      hot: v.replies ?? '',
      url: v.url || `https://www.v2ex.com/t/${v.id}`,
      extra: { author: v.member?.username || '', node: v.node?.title || '' },
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}
