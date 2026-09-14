import type { HotItem } from '../types'
import { UA_CHROME, getText, stripTags } from './utils'

/** GitHub Trending:解析官方 trending 页(服务端渲染) */
export async function fetchGithubTrending(): Promise<HotItem[]> {
  const html = await getText('https://github.com/trending', {
    headers: { 'User-Agent': UA_CHROME, Accept: 'text/html' },
  })
  const articles = html.match(/<article class="Box-row">[\s\S]*?<\/article>/g) || []
  if (!articles.length) throw new Error('trending 页解析为空')

  const items: HotItem[] = []
  for (const art of articles) {
    const repo = art.match(/<h2[^>]*>[\s\S]*?href="\/([^"]+)"[^>]*class="?[^\"]*"?[\s\S]*?<\/h2>/)?.[1]
      || art.match(/href="\/([^"]+)"[^>]*data-view-component="true"[\s\S]*?<\/h2>/)?.[1]
      || art.match(/<h2[\s\S]*?href="\/([^"]+)"/)?.[1]
    if (!repo) continue
    const desc = stripTags(art.match(/<p class="col-9[\s\S]*?>([\s\S]*?)<\/p>/)?.[1] || '')
    const starsToday = art.match(/([\d,]+)\s+stars\s+today/)?.[1]?.replace(/,/g, '') || ''
    const lang = art.match(/itemprop="programmingLanguage">([^<]+)</)?.[1] || ''
    items.push({
      title: repo,
      hot: starsToday ? `+${starsToday} star今日` : '',
      url: `https://github.com/${repo}`,
      extra: { desc, lang },
    })
    if (items.length >= 25) break
  }
  if (!items.length) throw new Error('trending 页解析为空')
  return items
}
