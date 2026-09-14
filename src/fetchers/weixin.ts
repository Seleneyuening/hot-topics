import type { HotItem } from '../types'
import { fetchTophubBoard } from './tophub'

/**
 * 微信公众号热文榜。微信公众平台没有公开的热榜接口,
 * 这里抓取 tophub.today 聚合板块作为 best-effort 兜底(接口失效只影响本榜,不影响其他平台)。
 */
export async function fetchWeixin(): Promise<HotItem[]> {
  return fetchTophubBoard('WnBe01o371')
}
