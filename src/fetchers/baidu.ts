import type { HotItem } from '../types'
import { UA_CHROME, firstOk, getJson, getText } from './utils'

function mapCardList(content: any[]): HotItem[] {
  return content
    .filter((item) => !item.isTop)
    .map((item) => ({
      title: item.word || '',
      hot: item.hotScore || '',
      url: item.rawUrl || item.url || `https://www.baidu.com/s?wd=${encodeURIComponent(item.word || '')}`,
      extra: { desc: item.desc || '', cover: item.img || '', tag: item.hotTag === 1 ? '新' : item.hotTag === 3 ? '热' : '' },
    }))
    .filter((i: HotItem) => !!i.title)
}

/** 官方 board 接口 */
async function viaBoardApi(): Promise<HotItem[]> {
  const json = await getJson('https://top.baidu.com/api/board?platform=wise&tab=realtime', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://top.baidu.com/board' },
  })
  const content: any[] = json?.data?.cards?.[0]?.content || []
  const items = mapCardList(content)
  if (!items.length) throw new Error('empty list')
  return items
}

/** 页面内嵌 s-data JSON(兜底) */
async function viaHtml(): Promise<HotItem[]> {
  const html = await getText('https://top.baidu.com/board?tab=realtime', {
    headers: { 'User-Agent': UA_CHROME },
  })
  const m = html.match(/<!--s-data:([\s\S]*?)-->/)
  if (!m) throw new Error('s-data block not found')
  const json = JSON.parse(m[1].replace(/\\-/g, '-'))
  const content: any[] = json?.data?.cards?.[0]?.content || []
  const items = mapCardList(content)
  if (!items.length) throw new Error('empty list')
  return items
}

export async function fetchBaidu(): Promise<HotItem[]> {
  return firstOk([
    { name: 'board-api', run: viaBoardApi },
    { name: 'html-s-data', run: viaHtml },
  ])
}
