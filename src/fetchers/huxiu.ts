import type { HotItem } from '../types'
import { UA_CHROME, getJson } from './utils'

/** 虎嗅·24小时热文(moment 动态流) */
export async function fetchHuxiu(): Promise<HotItem[]> {
  const json = await getJson('https://moment-api.huxiu.com/web-v3/moment/feed?platform=www', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.huxiu.com/moment/' },
  })
  const list: any[] = json?.data?.moment_list?.datalist || []
  const items = list
    .map((v) => {
      const firstLine = (v.content || '').replace(/<br\s*\/?>/gi, '\n').split('\n').map((s: string) => s.trim()).filter(Boolean)[0] || ''
      return {
        title: firstLine.replace(/。$/, ''),
        hot: v.count_info?.agree_num ?? '',
        url: `https://www.huxiu.com/moment/${v.object_id}.html`,
        extra: { author: v.user_info?.username || '' },
      }
    })
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}
