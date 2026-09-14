import type { HotItem } from '../types'
import { UA_CHROME, firstOk, getJson } from './utils'
import { md5 } from 'js-md5'

// 财联社接口签名:参数按字母排序 → SHA-1 → MD5(算法同 RSSHub)
async function clsQuery(extra: Record<string, string> = {}): Promise<string> {
  const params: Record<string, string> = { appName: 'CailianpressWeb', os: 'web', sv: '7.7.5', ...extra }
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  const sha1 = [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(sorted)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return new URLSearchParams({ ...params, sign: md5(sha1) }).toString()
}

function toItems(list: any[]): HotItem[] {
  return list
    .map((v) => ({
      title: (v.title || v.brief || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
      hot: v.views ?? '',
      url: `https://www.cls.cn/detail/${v.id}`,
      extra: { time: v.ctime ? new Date(v.ctime * 1000).toLocaleString('zh-CN', { hour12: false }) : '' },
    }))
    .filter((i: HotItem) => !!i.title)
}

/** 新浪财经·7x24 快讯(免签名兜底) */
async function viaSina7x24(): Promise<HotItem[]> {
  const json = await getJson(
    'https://zhibo.sina.com.cn/api/zhibo/feed?page=1&page_size=50&zhibo_id=152',
    { headers: { 'User-Agent': UA_CHROME, Referer: 'https://finance.sina.com.cn/7x24/' } },
    15000,
  )
  const list: any[] = json?.result?.data?.feed?.list || []
  const items = list
    .map((v) => {
      const text = (v.rich_text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      return {
        title: text.slice(0, 80) || (v.tag?.[0]?.name ?? ''),
        hot: '',
        url: v.docurl || 'https://finance.sina.com.cn/7x24/',
        extra: { time: v.create_time || '' },
      }
    })
    .filter((i: HotItem) => !!i.title)
  if (!items.length) throw new Error('empty list')
  return items
}

/** 财联社·热门文章(官方接口,带签名;源站对海外 IP 响应慢,超时放宽到 15s) */
export async function fetchCls(): Promise<HotItem[]> {
  return firstOk([
    {
      name: 'hot-list',
      run: async () => {
        const json = await getJson(`https://www.cls.cn/v2/article/hot/list?${await clsQuery()}`, {
          headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.cls.cn/' },
        }, 15000)
        const items = toItems(json?.data || [])
        if (!items.length) throw new Error('empty list')
        return items
      },
    },
    {
      name: 'depth-assembled',
      run: async () => {
        const json = await getJson(`https://www.cls.cn/v3/depth/home/assembled/1000?${await clsQuery()}`, {
          headers: { 'User-Agent': UA_CHROME, Referer: 'https://www.cls.cn/' },
        }, 15000)
        const list: any[] = json?.data?.depth_list || json?.data?.top_article || []
        const items = toItems(list).sort((m, n) => {
          const t1 = (m.extra?.time as string) || ''
          const t2 = (n.extra?.time as string) || ''
          return t2.localeCompare(t1)
        })
        if (!items.length) throw new Error('empty list')
        return items
      },
    },
    { name: 'sina-7x24', run: viaSina7x24 },
  ])
}
