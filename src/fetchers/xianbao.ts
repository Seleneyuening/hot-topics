import type { HotItem } from '../types'
import { decodeEntities, getJson } from './utils'

interface Articles {
  code: number
  data?: { items?: Array<{ title: string; url: string }> }
}

export async function fetchXianbao(): Promise<HotItem[]> {
  const result = await getJson<Articles>('https://new.xianbao.fun/api/v1/articles?limit=50')
  if (result.code !== 0 || !Array.isArray(result.data?.items)) {
    throw new Error('线报酷公开 API 返回无效数据')
  }
  const items = result.data.items
    .filter((item) => typeof item.title === 'string' && /^https:\/\/new\.xianbao\.fun\//i.test(item.url))
    .map((item) => ({ title: decodeEntities(item.title).trim(), hot: '', url: item.url }))
    .filter((item) => item.title.length > 0)
  if (!items.length) throw new Error('线报酷公开 API 暂无文章')
  return items
}
