import type { HotItem } from '../types'
import { UA_CHROME, getJson } from './utils'

export async function fetchNetease(): Promise<HotItem[]> {
  const json = await getJson('https://m.163.com/fe/api/hot/news/flow', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://m.163.com/' },
  })
  const list: any[] = json?.data?.list || []
  const items = list
    .map((v) => ({
      title: v.title || '',
      hot: '',
      url: `https://www.163.com/dy/article/${v.docid}.html`,
      extra: { source: v.source || '', cover: v.imgsrc || '' },
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}
