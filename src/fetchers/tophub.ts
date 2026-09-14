import type { HotItem } from '../types'
import { UA_CHROME, getText, stripTags } from './utils'

/**
 * tophub.today 板块榜解析(best-effort 兜底源)。
 * 只认页面第一个 <table> 内的 <a> 条目与纯数字热度,天然避开脚本模板与图标字体。
 */
export async function fetchTophubBoard(boardId: string): Promise<HotItem[]> {
  const html = await getText(`https://tophub.today/n/${boardId}`, { headers: { 'User-Agent': UA_CHROME } })
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0]
  if (!table) throw new Error('tophub 页面无榜单表格')

  const items: HotItem[] = []
  for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const a = row[1].match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!a) continue
    const title = stripTags(a[2])
    if (!title || title === 'API 开放平台') continue
    // 过滤页面脚本模板残渣
    if (/['`]\s*[+&]|item\.title|v\.title|&#[x0-9a-f]/i.test(title)) continue
    // 热度只认纯数字(+万/亿/K/W)且非行号
    let hot = ''
    for (const cell of row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)) {
      const cand = stripTags(cell[1])
      if (/^[\d.,]+\s*[万亿KkWw]?$/.test(cand) && !/^\d{1,3}\.$/.test(cand)) {
        if (/[万亿KkWw]/.test(cand) || cand.replace(/\D/g, '').length >= 3) {
          hot = cand
          break
        }
      }
    }
    items.push({ title, hot, url: a[1] })
  }
  if (!items.length) throw new Error('榜单解析为空')
  return items
}
