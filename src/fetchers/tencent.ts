import type { HotItem } from '../types'
import { UA_CHROME, getJson } from './utils'

/** 腾讯新闻热点榜(DailyHotApi 同款端点) */
export async function fetchTencent(): Promise<HotItem[]> {
  const json = await getJson('https://r.inews.qq.com/gw/event/hot_ranking_list?page_size=50', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://news.qq.com/' },
  })
  const newslist: any[] = json?.idlist?.[0]?.newslist || []
  const items = newslist
    .slice(1) // 首条为固定占位,丢弃
    .map((v) => ({
      title: v.title || '',
      hot: v.hotEvent?.hotScore ?? '',
      url: `https://new.qq.com/rain/a/${v.id}`,
      extra: { source: v.source || '', abstract: v.abstract || '', cover: v.miniProShareImage || '' },
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}
