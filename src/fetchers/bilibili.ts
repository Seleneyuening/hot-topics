import type { HotItem } from '../types'
import { UA_CHROME, firstOk, getJson } from './utils'

function getBiliJson(url: string) {
  return getJson(url, { headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.bilibili.com/' } })
}

/** 站内热搜词(s.search 子站,风控较宽松) */
async function viaHotword(): Promise<HotItem[]> {
  const json = await getBiliJson('https://s.search.bilibili.com/main/hotword?limit=50')
  const list: any[] = json?.top_list?.length ? json.top_list : json?.list || []
  const items = list
    .map((item) => ({
      title: item.show_name || item.keyword || '',
      hot: item.heat_score || '',
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword || item.show_name || '')}`,
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}

function mapVideoList(list: any[]): HotItem[] {
  return list.map((item) => ({
    title: item.title || '',
    hot: item.stat?.view ? `${Math.round(item.stat.view / 10000)}万播放` : '',
    url: item.short_link_v2 || `https://www.bilibili.com/video/${item.bvid}`,
    extra: { author: item.owner?.name, pic: item.pic },
  }))
}

/** 全站排行榜 */
async function viaRanking(): Promise<HotItem[]> {
  const json = await getBiliJson('https://api.bilibili.com/x/web-interface/ranking/v2')
  const items = mapVideoList(json?.data?.list || [])
  if (!items.length) throw new Error('empty list')
  return items
}

/** B 站热搜词 */
export async function fetchBilibili(): Promise<HotItem[]> {
  return viaHotword()
}

/** B 站热门视频榜 */
export async function fetchBilibiliVideo(): Promise<HotItem[]> {
  return firstOk([
    {
      name: 'popular',
      run: async () => {
        const json = await getBiliJson('https://api.bilibili.com/x/web-interface/popular')
        const items = mapVideoList(json?.data?.list || [])
        if (!items.length) throw new Error('empty list')
        return items
      },
    },
    { name: 'ranking-v2', run: viaRanking },
  ])
}
