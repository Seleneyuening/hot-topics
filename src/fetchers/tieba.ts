import type { HotItem } from '../types'
import { UA_CHROME, getJson } from './utils'

export async function fetchTieba(): Promise<HotItem[]> {
  const json = await getJson('https://tieba.baidu.com/hottopic/browse/topicList', {
    headers: { 'User-Agent': UA_CHROME, Referer: 'https://tieba.baidu.com/' },
  })
  const list: any[] = json?.data?.bang_topic?.topic_list || []
  const items = list
    .map((v) => ({
      title: v.topic_name || '',
      hot: v.discuss_num ?? '',
      url: v.topic_url || '',
      extra: { desc: v.topic_desc || '', avatar: v.topic_avatar || '' },
    }))
    .filter((i: HotItem) => !!i.title && !!i.url)
  if (!items.length) throw new Error('empty list')
  return items
}
