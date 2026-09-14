import type { HotItem } from '../types'
import { UA_CHROME, getText } from './utils'
import { parseRss } from './ithome'

/** 爱范儿官方 RSS */
export async function fetchIfanr(): Promise<HotItem[]> {
  const xml = await getText('https://www.ifanr.com/feed', { headers: { 'User-Agent': UA_CHROME } })
  const items = parseRss(xml)
  if (!items.length) throw new Error('RSS 解析为空')
  return items
}
