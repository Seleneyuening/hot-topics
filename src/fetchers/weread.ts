import type { HotItem } from '../types'
import { UA_CHROME, getJson } from './utils'

/** 微信读书·飙升榜(官方页面接口) */
export async function fetchWeread(): Promise<HotItem[]> {
  const json = await getJson('https://weread.qq.com/web/bookListInCategory/rising?rank=1', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://weread.qq.com/' },
  })
  const list: any[] = json?.books || []
  const items = list
    .map((v) => {
      const b = v?.bookInfo || {}
      return {
        title: b.title || '',
        hot: typeof b.readingCount === 'number' ? b.readingCount : '',
        url: `https://weread.qq.com/web/reader/${b.bookId || ''}`,
        extra: { author: b.author || '' },
      }
    })
    .filter((i: HotItem) => !!i.title && !!i.url)
  if (!items.length) throw new Error('empty list')
  return items
}
