import type { HotItem } from '../types'
import { getJson } from './utils'

export async function fetchThepaper(): Promise<HotItem[]> {
  const json = await getJson('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar')
  const list: any[] = json?.data?.hotNews || []
  const items = list
    .map((v) => ({
      title: v.name || '',
      hot: '',
      url: `https://www.thepaper.cn/newsDetail_forward_${v.contId}`,
      extra: { pub_time: v.pubTimeLong || '' },
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}
