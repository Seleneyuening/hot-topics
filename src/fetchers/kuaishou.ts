import type { HotItem } from '../types'
import { UA_CHROME, extractBalancedJson, getText } from './utils'

/** 快手热榜:解析首页内嵌的 Apollo State JSON(可能有多个数据块,取含热榜的那个) */
export async function fetchKuaishou(): Promise<HotItem[]> {
  const html = await getText('https://www.kuaishou.com/?isHome=1', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.kuaishou.com/' },
  })

  let data: any = null
  let marker = html.indexOf('__APOLLO_STATE__')
  while (marker !== -1 && !data) {
    const braceStart = html.indexOf('{', marker)
    if (braceStart === -1) break
    const jsonText = extractBalancedJson(html, braceStart)
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText)
        if (Object.keys(parsed?.defaultClient?.ROOT_QUERY || {}).some((k) => k.startsWith('visionHotRank'))) {
          data = parsed
        }
      } catch {
        // 当前块不是合法 JSON,继续找下一个标记
      }
    }
    marker = html.indexOf('__APOLLO_STATE__', marker + 1)
  }
  if (!data) throw new Error('未找到 APOLLO_STATE 热榜数据')

  const root = data.defaultClient.ROOT_QUERY
  const rankKey = Object.keys(root).find((k) => k.startsWith('visionHotRank'))
  const rankRef = rankKey ? root[rankKey]?.id : null
  const rank = rankRef ? data.defaultClient[rankRef] : null
  const items = (rank?.items || [])
    .map((it: any) => data.defaultClient[it.id])
    .filter((it: any) => it && it.tagType !== '置顶')
    .map((it: any) => ({
      title: it.name || '',
      hot: typeof it.hotValue === 'number' ? it.hotValue : '',
      url: `https://www.kuaishou.com/search/video?searchKey=${encodeURIComponent(it.name || '')}`,
      extra: { icon: it.iconUrl || '' },
    }))
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('热榜解析为空')
  return items
}
