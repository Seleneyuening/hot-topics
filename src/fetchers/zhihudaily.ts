import type { HotItem } from '../types'
import { getJson } from './utils'

/** 知乎日报·今日最热文章(官方 API) */
export async function fetchZhihudaily(): Promise<HotItem[]> {
  const json = await getJson('https://daily.zhihu.com/api/4/news/latest', {
    headers: { Referer: 'https://daily.zhihu.com/' },
  })
  const list: any[] = json?.stories || []
  const items = list
    .filter((v) => v.type === 0)
    .map((v) => ({
      title: v.title || '',
      hot: '',
      url: v.url || '',
      extra: { hint: v.hint || '' },
    }))
    .filter((i: HotItem) => !!i.title && !!i.url)
  if (!items.length) throw new Error('empty list')
  return items
}
