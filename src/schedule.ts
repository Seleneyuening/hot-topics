import { PLATFORMS } from './registry'

export const CRONS = [
  '*/5 * * * *',
  '1-59/5 * * * *',
  '2-59/5 * * * *',
]

const frequent: Record<string, { shard: number; minutes: number }> = {
  baidu: { shard: 0, minutes: 5 },
  bilibili: { shard: 1, minutes: 5 },
  douyin: { shard: 2, minutes: 5 },
  github: { shard: 0, minutes: 15 },
  rednote: { shard: 1, minutes: 60 },
}

const paused: Record<string, string> = {
  weibo: '微博限制自动采集。取得平台许可后再启用。',
  zhihu: '匿名测试有榜单数据，知乎 robots.txt 对通用爬虫限制此路径。取得平台许可后再启用。',
  'bilibili-video': '热门视频 API 的 robots.txt 限制自动访问。可打开 B 站官方热门页。',
  cls: '原抓取器依赖客户端签名，候补为另一平台的快讯。取得授权渠道后再启用。',
  x: '第三方来源 trends24.today 暂未通过可访问性验证。',
  weixin: '第三方来源 tophub.today，等待确认聚合内容可再分发。',
}

const links: Record<string, string> = {
  rednote: 'https://www.xiaohongshu.com/explore',
  weibo: 'https://s.weibo.com/top/summary?cate=realtimehot',
  zhihu: 'https://www.zhihu.com/hot',
  'bilibili-video': 'https://www.bilibili.com/v/popular/all',
  cls: 'https://www.cls.cn/',
  x: 'https://x.com/explore',
}

const sources: Record<string, string> = {
  rednote: '小红书匿名接口 edith.xiaohongshu.com',
  bilibili: 'B站站内热搜 s.search.bilibili.com',
  'bilibili-video': 'B站热门视频 api.bilibili.com',
  cls: '财联社簽名接口；上游候补为新浪财经（不同榜单）',
  x: '第三方聚合 · trends24.today',
  weixin: '第三方聚合 · tophub.today',
}

let standardIndex = 0
export const FEEDS = PLATFORMS.map((platform) => {
  const fast = frequent[platform.id]
  const index = fast || paused[platform.id] ? 0 : standardIndex++
  return {
    ...platform,
    source: sources[platform.id] ?? platform.source,
    link: links[platform.id],
    paused: paused[platform.id],
    shard: fast?.shard ?? index % CRONS.length,
    minutes: fast?.minutes ?? 60,
    slot: platform.id === 'github' ? 2 : platform.id === 'rednote' ? 0 : Math.floor(index / CRONS.length) % 12,
  }
})

export function isDue(feed: (typeof FEEDS)[number], tick: number): boolean {
  const period = feed.minutes / 5
  return tick % period === feed.slot % period
}
