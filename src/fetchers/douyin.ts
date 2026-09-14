import type { HotItem } from '../types'
import { UA_CHROME, fetchWithTimeout, firstOk, getJson } from './utils'

function mapWordList(wordList: any[]): HotItem[] {
  return wordList
    .map((item) => ({
      title: item.word || '',
      hot: item.hot_value ?? '',
      url: item.word ? `https://www.douyin.com/search/${encodeURIComponent(item.word)}` : '',
      extra: { label: item.label || 0, cover: item.word_cover?.url_list?.[0] || '' },
    }))
    .filter((i: HotItem) => !!i.title)
}

/** 移动端 snssdk 接口(免 Cookie) */
async function viaSnssdk(host: string): Promise<HotItem[]> {
  const json = await getJson(`https://${host}/aweme/v1/hot/search/list/?aid=1128&version_code=880`, {
    headers: { 'User-Agent': UA_CHROME },
  })
  const items = mapWordList(json?.data?.word_list || [])
  if (!items.length) throw new Error('empty list')
  return items
}

/** Web 接口(兜底):先访问登录页换 Cookie,再请求热搜 */
async function viaWeb(): Promise<HotItem[]> {
  let cookie = ''
  try {
    const res = await fetchWithTimeout('https://login.douyin.com/')
    const setCookies: string[] = (res.headers as any).getSetCookie?.() || []
    cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
  } catch {
    // 拿不到 Cookie 时仍尝试无 Cookie 请求
  }
  const json = await getJson(
    'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1',
    {
      headers: {
        'User-Agent': UA_CHROME,
        Referer: 'https://www.douyin.com/',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    },
  )
  const items = mapWordList(json?.data?.word_list || [])
  if (!items.length) throw new Error('empty list')
  return items
}

export async function fetchDouyin(): Promise<HotItem[]> {
  return firstOk([
    { name: 'snssdk-lq', run: () => viaSnssdk('aweme-lq.snssdk.com') },
    { name: 'snssdk', run: () => viaSnssdk('aweme.snssdk.com') },
    { name: 'web', run: viaWeb },
  ])
}
