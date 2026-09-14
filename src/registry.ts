import type { HotItem } from './types'
import { fetchWeibo } from './fetchers/weibo'
import { fetchZhihu } from './fetchers/zhihu'
import { fetchBaidu } from './fetchers/baidu'
import { fetchDouyin } from './fetchers/douyin'
import { fetchToutiao } from './fetchers/toutiao'
import { fetchBilibili, fetchBilibiliVideo } from './fetchers/bilibili'
import { fetchRednote } from './fetchers/rednote'
import { fetchKuaishou } from './fetchers/kuaishou'
import { fetchTencent } from './fetchers/tencent'
import { fetchNetease } from './fetchers/netease'
import { fetchTieba } from './fetchers/tieba'
import { fetchThepaper } from './fetchers/thepaper'
import { fetchWeixin } from './fetchers/weixin'
import { fetchIthome } from './fetchers/ithome'
import { fetchIfanr } from './fetchers/ifanr'
import { fetchSspai } from './fetchers/sspai'
import { fetchXTrends } from './fetchers/x'
import { fetchGithubTrending } from './fetchers/github'
import { fetchHackerNews } from './fetchers/hackernews'
import { fetchVoa, fetchBbc, fetchDw, fetchRfi, fetchZaobao } from './fetchers/world'
import { fetchXianbao } from './fetchers/xianbao'
import { fetchHuxiu } from './fetchers/huxiu'
import { fetchJuejin } from './fetchers/juejin'
import { fetchV2ex } from './fetchers/v2ex'
import { fetchHupu } from './fetchers/hupu'
import { fetchZhihudaily } from './fetchers/zhihudaily'
import { fetchDoubanMovie } from './fetchers/douban'
import { fetchCls } from './fetchers/cls'
import { fetchWeread } from './fetchers/weread'

export interface PlatformDef {
  id: string
  name: string
  category: '综合' | '社区' | '新闻' | '科技' | '国际' | '线报' | '财经' | '书影' | '体育'
  /** 数据来源说明(维护排查用) */
  source: string
  fetcher: () => Promise<HotItem[]>
}

/**
 * 平台注册表:新增平台只需实现一个 fetcher 并在此登记,
 * /api 路由、缓存、前端界面都会自动生效。
 */
export const PLATFORMS: PlatformDef[] = [
  { id: 'weibo', name: '微博热搜', category: '综合', source: 'weibo.com 官方接口', fetcher: fetchWeibo },
  { id: 'zhihu', name: '知乎热榜', category: '社区', source: 'zhihu.com 官方接口', fetcher: fetchZhihu },
  { id: 'baidu', name: '百度热搜', category: '综合', source: 'top.baidu.com 官方接口', fetcher: fetchBaidu },
  { id: 'douyin', name: '抖音热点', category: '综合', source: 'snssdk.com 官方接口', fetcher: fetchDouyin },
  { id: 'toutiao', name: '今日头条', category: '综合', source: 'toutiao.com 官方接口', fetcher: fetchToutiao },
  { id: 'kuaishou', name: '快手热榜', category: '综合', source: 'kuaishou.com 首页数据', fetcher: fetchKuaishou },
  { id: 'rednote', name: '小红书热点', category: '综合', source: 'edith.xiaohongshu.com App 接口', fetcher: fetchRednote },
  { id: 'bilibili', name: 'B站热搜', category: '社区', source: 'api.bilibili.com 官方接口', fetcher: fetchBilibili },
  { id: 'bilibili-video', name: 'B站热门视频', category: '社区', source: 'B站官方视频日榜(经 tophub)', fetcher: fetchBilibiliVideo },
  { id: 'tieba', name: '百度贴吧热议', category: '社区', source: 'tieba.baidu.com 官方接口', fetcher: fetchTieba },
  { id: 'tencent', name: '腾讯新闻热点榜', category: '新闻', source: 'r.inews.qq.com 官方接口', fetcher: fetchTencent },
  { id: 'netease', name: '网易新闻', category: '新闻', source: 'm.163.com 官方接口', fetcher: fetchNetease },
  { id: 'thepaper', name: '澎湃新闻热榜', category: '新闻', source: 'cache.thepaper.cn 官方接口', fetcher: fetchThepaper },
  { id: 'weixin', name: '微信公众号热文', category: '新闻', source: 'tophub.today 聚合(best-effort)', fetcher: fetchWeixin },
  { id: 'ithome', name: 'IT之家资讯', category: '科技', source: 'ithome.com 官方 RSS', fetcher: fetchIthome },
  { id: 'ifanr', name: '爱范儿资讯', category: '科技', source: 'ifanr.com 官方 RSS', fetcher: fetchIfanr },
  { id: 'sspai', name: '少数派热文', category: '科技', source: 'sspai.com 官方接口', fetcher: fetchSspai },
  { id: 'github', name: 'GitHub Trending', category: '科技', source: 'github.com/trending 官方页面', fetcher: fetchGithubTrending },
  { id: 'hackernews', name: 'Hacker News', category: '科技', source: 'HN 官方 API', fetcher: fetchHackerNews },
  { id: 'x', name: 'X(推特)热榜', category: '国际', source: 'trends24.today 聚合(X 无公开接口,best-effort)', fetcher: fetchXTrends },
  { id: 'voa', name: '美国之音', category: '国际', source: 'voachinese.com 官方 RSS', fetcher: fetchVoa },
  { id: 'bbc', name: 'BBC 中文网', category: '国际', source: 'feeds.bbci.co.uk 官方 RSS', fetcher: fetchBbc },
  { id: 'dw', name: '德国之声', category: '国际', source: 'rss.dw.com 官方 RSS', fetcher: fetchDw },
  { id: 'rfi', name: '法广 RFI', category: '国际', source: 'rfi.fr 官方 RSS', fetcher: fetchRfi },
  { id: 'zaobao', name: '联合早报·国际', category: '国际', source: 'zaobao.com 官方页面', fetcher: fetchZaobao },
  { id: 'xianbao', name: '线报酷·最新线报', category: '线报', source: 'new.xianbao.fun 官方页面', fetcher: fetchXianbao },
  { id: 'huxiu', name: '虎嗅·24小时', category: '科技', source: 'moment-api.huxiu.com 官方接口', fetcher: fetchHuxiu },
  { id: 'juejin', name: '掘金·文章榜', category: '科技', source: 'api.juejin.cn 官方接口', fetcher: fetchJuejin },
  { id: 'v2ex', name: 'V2EX·最热', category: '社区', source: 'v2ex.com 官方 API', fetcher: fetchV2ex },
  { id: 'zhihudaily', name: '知乎日报', category: '新闻', source: 'daily.zhihu.com 官方 API', fetcher: fetchZhihudaily },
  { id: 'cls', name: '财联社·热文', category: '财经', source: 'cls.cn 官方接口', fetcher: fetchCls },
  { id: 'douban-movie', name: '豆瓣电影·新片榜', category: '书影', source: 'movie.douban.com 官方页面', fetcher: fetchDoubanMovie },
  { id: 'weread', name: '微信读书·飙升榜', category: '书影', source: 'weread.qq.com 官方接口', fetcher: fetchWeread },
  { id: 'hupu', name: '虎扑·步行街热帖', category: '体育', source: 'm.hupu.com 官方接口', fetcher: fetchHupu },
]

export const PLATFORM_MAP = new Map(PLATFORMS.map((p) => [p.id, p]))
