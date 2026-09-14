import type { HotItem } from '../types'
import { UA_CHROME, getJson } from './utils'

/** 少数派热门文章(newsnow 同款端点) */
export async function fetchSspai(): Promise<HotItem[]> {
  const url =
    `https://sspai.com/api/v1/article/tag/page/get?limit=30&offset=0` +
    `&created_at=${Date.now()}&tag=%E7%83%AD%E9%97%A8%E6%96%87%E7%AB%A0&released=false`
  const json = await getJson(url, { headers: { 'User-Agent': UA_CHROME, Referer: 'https://sspai.com/' } })
  const list: any[] = json?.data || []
  const items = list
    .map((k) => ({
      title: k.title || '',
      hot: '',
      url: `https://sspai.com/post/${k.id}`,
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}
