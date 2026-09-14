import type { HotItem } from '../types'
import { getJson } from './utils'

const API = 'https://hacker-news.firebaseio.com/v0'

/** Hacker News 热门榜(官方 API) */
export async function fetchHackerNews(): Promise<HotItem[]> {
  const ids = await getJson<number[]>(`${API}/topstories.json`)
  const top = (ids || []).slice(0, 20)
  const results = await Promise.all(
    top.map(async (id): Promise<HotItem | null> => {
      try {
        const it = await getJson<any>(`${API}/item/${id}.json`)
        if (!it?.title) return null
        return {
          title: it.title,
          hot: it.score ?? '',
          url: it.url || `https://news.ycombinator.com/item?id=${id}`,
          extra: { by: it.by || '', comments: it.descendants ?? 0 },
        }
      } catch {
        return null
      }
    }),
  )
  const items = results.filter((i): i is HotItem => !!i)
  if (!items.length) throw new Error('empty list')
  return items
}
