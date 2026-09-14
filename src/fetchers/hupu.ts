import type { HotItem } from '../types'
import { getJson } from './utils'

/** 虎扑·步行街热帖(移动端 API,topicId=1 主干道) */
export async function fetchHupu(): Promise<HotItem[]> {
  const json = await getJson('https://m.hupu.com/api/v2/bbs/topicThreads?topicId=1&page=1', {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', Referer: 'https://m.hupu.com/' },
  })
  const list: any[] = json?.data?.topicThreads || []
  const items = list
    .map((v) => ({
      title: v.title || '',
      hot: v.replies ?? '',
      url: `https://bbs.hupu.com/${v.tid}.html`,
      extra: { author: v.username || '' },
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}
