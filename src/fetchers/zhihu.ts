import type { HotItem } from '../types'
import { UA_CHROME, UA_ZHIHU, firstOk, getJson } from './utils'

/** App 接口(免 Cookie) */
async function viaAppApi(): Promise<HotItem[]> {
  const json = await getJson('https://api.zhihu.com/topstory/hot-lists/total?limit=50', {
    headers: { 'User-Agent': UA_ZHIHU, Referer: 'https://www.zhihu.com/' },
  })
  const list: any[] = json?.data || []
  const items = list
    .map((item) => {
      const target = item?.target || {}
      return {
        title: target.title || '',
        hot: item.detail_text || '',
        url: target.url
          ? target.url.replace('api.', 'www.').replace('/questions/', '/question/')
          : '',
        extra: { excerpt: target.excerpt || '' },
      }
    })
    .filter((i: HotItem) => !!i.title && !!i.url)
  if (!items.length) throw new Error('empty list')
  return items
}

/** Web v3 接口(兜底) */
async function viaWebV3(): Promise<HotItem[]> {
  const json = await getJson('https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=50&desktop=true', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.zhihu.com/hot' },
  })
  const list: any[] = json?.data || []
  const items = list
    .map((k) => ({
      title: k?.target?.title_area?.text || '',
      hot: k?.target?.metrics_area?.text || '',
      url: k?.target?.link?.url || '',
      extra: { excerpt: k?.target?.excerpt_area?.text || '' },
    }))
    .filter((i: HotItem) => !!i.title && !!i.url)
  if (!items.length) throw new Error('empty list')
  return items
}

export async function fetchZhihu(): Promise<HotItem[]> {
  return firstOk([
    { name: 'app-api', run: viaAppApi },
    { name: 'web-v3', run: viaWebV3 },
  ])
}
