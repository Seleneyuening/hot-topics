import type { HotItem } from '../types'
import { getJson } from './utils'

export async function fetchRednote(): Promise<HotItem[]> {
  const json = await getJson('https://edith.xiaohongshu.com/api/sns/v1/search/hot_list')
  const list: any[] = json?.data?.items || []
  const items = list
    .map((item) => ({
      title: item.title || '',
      hot: item.score ?? '',
      url: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(item.title || '')}&type=51`,
      extra: { word_type: item.word_type || '', icon: item.icon || '' },
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}
