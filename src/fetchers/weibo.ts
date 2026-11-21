import type { HotItem } from '../types'
import { UA_CHROME, firstOk, getJson } from './utils'

/** 桌面端 AJAX 接口(免 Cookie) */
async function viaDesktop(): Promise<HotItem[]> {
  const json = await getJson('https://weibo.com/ajax/side/hotSearch', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://weibo.com/' },
  })
  const realtime: any[] = json?.data?.realtime || []
  const items = realtime
    .filter((item) => item.is_ad !== 1)
    .map((item) => {
      const title = item.word || item.note || ''
      return {
        title,
        hot: item.num ?? item.raw_hot ?? '',
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`,
        extra: { label: item.label_name || '', category: item.category || '' },
      }
    })
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}

/** 移动端 container 接口(兜底),pic 形如 img_search_N 的才是热搜本体,其余为推广 */
async function viaMobile(): Promise<HotItem[]> {
  const url =
    'https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot'
  const json = await getJson(url, {
    headers: {
      'User-Agent': UA_CHROME,
      Referer: 'https://m.weibo.cn/',
    },
  })
  const group: any[] = json?.data?.cards?.[0]?.card_group || []
  const items = group
    .filter((e) => /img_search_\d+/.test(e.pic || ''))
    .map((e) => ({
      title: e.desc,
      hot: Number(e.desc_extr) || '',
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(e.desc)}`,
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}

export async function fetchWeibo(): Promise<HotItem[]> {
  return firstOk([
    { name: 'desktop-ajax', run: viaDesktop },
    { name: 'mobile-container', run: viaMobile },
  ])
}
