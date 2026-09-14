import type { HotItem } from '../types'
import { UA_CHROME, getJson } from './utils'

export async function fetchToutiao(): Promise<HotItem[]> {
  const json = await getJson('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.toutiao.com/' },
  })
  const list: any[] = json?.data || []
  const items = list
    .map((item) => ({
      title: item.Title || '',
      hot: item.HotValue ?? '',
      url: item.Url || `https://www.toutiao.com/trending/${item.ClusterIdStr || ''}`,
      extra: { cover: item.Image?.url || '', label: item.LabelDesc || '' },
    }))
    .filter((i: HotItem) => !!i.title && !!i.url)
  if (!items.length) throw new Error('empty list')
  return items
}
