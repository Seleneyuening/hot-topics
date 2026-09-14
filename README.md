# hot-topics

**全网热点聚合网关（自托管版）** —— 直连各平台**官方公开接口**抓取微博 / 知乎 / 百度 / 抖音 / 今日头条 / 快手 / 小红书 / B站 / 贴吧 / 腾讯新闻 / 网易新闻 / 澎湃 / 微信公众号热文 / IT之家 / 爱范儿 / 少数派实时热榜，提供统一 JSON API 与 Web 界面，**Cloudflare Workers / Pages 双部署**。

> v3 起**彻底移除对 60s 等第三方聚合服务的依赖**：部署后数据通路完全自有，第三方实例限流、跑路、改版都不再影响你。同类项目实现参考了 [newsnext/newsnow](https://github.com/newsnext/newsnow)、[imsyy/DailyHotApi](https://github.com/imsyy/DailyHotApi) 与 [vikiboss/60s](https://github.com/vikiboss/60s)，并在此基础上为每个平台增加了多端点故障转移。

---

## 特性

- **全本地化**：每个平台都是网关进程内直连源站官方接口，无中间商
- **多端点回退**：核心平台均内置 2–4 条抓取通道，一条失效自动切换（见 `src/fetchers/`）
- **三级容错**：抓取失败 → 先返回过期缓存（标记 `stale`）→ 才如实报错，绝不伪造数据
- **双部署**：同一份代码同时产出 Workers（纯 API + cron 预热）与 Pages（API + Web 界面）两个产物
- **可选 KV 缓存**：绑定 KV 后缓存跨实例共享，源站故障时还能用旧数据撑住
- **Web 界面**：暗色/亮色主题、关键词筛选、分类过滤、自动刷新、一键复制 Markdown（零外部依赖，连字体都不走 CDN）

## 快速开始

### 本地开发

```bash
npm install
npm run dev              # Workers 本地模拟 (http://localhost:8787)
npm run dev:pages        # Pages 本地模拟 (含静态界面)
npm run test:fetchers    # 冒烟测试:实测全部平台抓取
npm run typecheck
```

### 部署 A：Cloudflare Workers（推荐，纯 API + 定时预热）

```bash
npx wrangler login
npm run deploy                       # 构建并部署,得到 https://hot-topics.<你的子域>.workers.dev
```

推荐开启 KV（缓存跨实例共享 + 故障降级）：

```bash
npm run kv:create                    # 创建 KV namespace,记下返回的 id
# 编辑 wrangler.toml:取消 [[kv_namespaces]] 注释并填入 id
npm run deploy
```

`wrangler.toml` 已内置每 15 分钟的 cron 预热（`*/15 * * * *`），冷启动也有缓存数据。

### 部署 B：Cloudflare Pages（API + Web 界面）

当前已部署：**https://hot-topics.pages.dev**（项目 `hot-topics`，KV 缓存已绑定）。

```bash
npm run deploy:pages                 # 构建并部署 dist/pages(脚本自动交换 wrangler 配置)
```

> 注意:Cloudflare Pages 命令只读取根目录 `wrangler.toml`,而本仓库该文件是 Workers 配置,
> 因此 `npm run deploy:pages` 通过 `scripts/deploy-pages.mjs` 临时交换两个配置文件完成部署。
> 或接入 Git 仓库由 Pages 自动构建:构建命令 `npm run build`,输出目录 `dist/pages`。

### 验证

```bash
curl -s https://<你的部署域名>/healthz
# {"ok":true,"version":"3.0.0","platforms":17,...}
```

## API

> 🔒 **鉴权**:`/api/*` 由 `API_KEYS` 环境变量控制(逗号分隔可配多个;留空则完全不启用鉴权):
> - **浏览器正常访问免 Key**:打开网站时网关自动签发 24 小时 HMAC 签名会话 Cookie,后续请求自动携带
> - **程序化调用需要 Key**:三种方式任选 —— `?key=<Key>` / `X-API-Key: <Key>` / `Authorization: Bearer <Key>`
> - 缺失或无效返回 `401`;会话签名无状态可验,伪造/过期 Cookie 均被拒绝

| 端点 | 说明 |
|------|------|
| `GET /api/all?limit=N` | 全部榜单并行抓取（平台多时可能触发单请求子请求上限，程序化调用建议用分类端点） |
| `GET /api/category/:cat?limit=N` | **按分类聚合**（推荐，如 `综合`/`科技`/`国际`/`线报`…，URL 编码中文），子请求友好 |
| `GET /api/:platform?limit=N` | 单平台榜单；`&refresh=1` 强制绕过缓存 |
| `GET /api/platforms` | 平台清单（id/名称/分类/来源说明） |
| `GET /healthz` | 健康检查（免鉴权） |
| `GET /` | Workers 返回 API 摘要；Pages 返回 Web 界面 |

Web 界面即按分类分批加载，单分类失败只影响该分类卡片。

单平台示例：

```bash
curl -s "https://<域名>/api/weibo?limit=5&key=<你的Key>"
# 或
curl -s -H "Authorization: Bearer <你的Key>" "https://<域名>/api/weibo?limit=5"
```

```json
{
  "code": 200,
  "data": {
    "platform": "weibo", "name": "微博热搜", "category": "综合",
    "update_time": "2026-09-12T04:30:00.000Z", "total": 50,
    "items": [{ "title": "...", "hot": 1162167, "url": "https://s.weibo.com/..." }]
  }
}
```

- `hot` 为平台原始口径（数值 / `"947.5w"` / `"10.0万"`），跨平台不可直接比较
- `stale: true` 表示本次来自过期缓存（源站抓取失败时的降级）
- 单平台抓取失败返回 `code: 502` 与 `error` 字段，不影响其他平台

## 数据源一览（34 榜）

| 平台 | 分类 | 来源 | 回退通道 |
|------|------|------|---------|
| 微博热搜 | 综合 | weibo.com 官方接口 | 桌面 AJAX → 移动 container |
| 知乎热榜 | 社区 | zhihu.com 官方接口 | App 接口 → Web v3 |
| 百度热搜 | 综合 | top.baidu.com 官方接口 | board API → 页面 s-data JSON |
| 抖音热点 | 综合 | snssdk.com 官方接口 | snssdk-lq → snssdk → Web(换Cookie) |
| 今日头条 | 综合 | toutiao.com 官方接口 | hot-board 接口 |
| 快手热榜 | 综合 | kuaishou.com 首页数据 | Apollo State 解析(括号平衡) |
| 小红书热点 | 综合 | edith.xiaohongshu.com App 接口 | 60s 同款 App 请求头 |
| B站热搜 | 社区 | s.search.bilibili.com 站内热搜 | hotword → wbi square → App trending → tophub 日榜 |
| B站热门视频 | 社区 | B站官方视频日榜(经 tophub) | tophub 日榜 → popular → 全站排行 |
| 贴吧热议 | 社区 | tieba.baidu.com 官方接口 | hottopic 接口 |
| 腾讯新闻热点榜 | 新闻 | r.inews.qq.com 官方接口 | hot_ranking_list |
| 网易新闻 | 新闻 | m.163.com 官方接口 | hot/news/flow |
| 澎湃新闻热榜 | 新闻 | cache.thepaper.cn 官方接口 | contentapi |
| 微信公众号热文 | 新闻 | tophub.today 聚合 | ⚠️ best-effort（微信无公开热榜接口），失效只影响本榜 |
| IT之家资讯 | 科技 | ithome.com 官方 RSS | — |
| 爱范儿资讯 | 科技 | ifanr.com 官方 RSS | — |
| 少数派热文 | 科技 | sspai.com 官方接口 | 热门文章 tag 接口 |
| GitHub Trending | 科技 | github.com/trending 官方页面 | — |
| Hacker News | 科技 | HN 官方 API(firebaseio) | — |
| X(推特)热榜 | 国际 | trends24.today 聚合 | ⚠️ best-effort（X 无公开趋势接口），失效只影响本榜 |
| 美国之音 | 国际 | voachinese.com 官方 RSS | 已知 key → 双索引页自动发现 feed(Pangea key 会轮换) |
| BBC 中文网 | 国际 | feeds.bbci.co.uk 官方 RSS | 简体 → 繁体 |
| 德国之声 | 国际 | rss.dw.com 官方 RSS | rdf → xml |
| 法广 RFI | 国际 | rfi.fr 官方 RSS | 中文 → 英文 |
| 联合早报·国际 | 国际 | zaobao.com 官方页面 | 服务端渲染页解析(story 链接特征) |
| 线报酷·最新线报 | 线报 | new.xianbao.fun 官方页面 | 服务端渲染列表(含分类/发报人/时间) |
| 虎嗅·24小时 | 科技 | moment-api.huxiu.com 官方接口 | 动态流首行做标题 |
| 掘金·文章榜 | 科技 | api.juejin.cn 官方接口 | article_rank |
| V2EX·最热 | 社区 | v2ex.com 官方 API | topics/hot.json |
| 知乎日报 | 新闻 | daily.zhihu.com 官方 API | news/latest |
| Linux.do | — | ❌ 已移除:站点开了 CF 盾,Workers 请求被 403 |
| 财联社·热文 | 财经 | cls.cn 官方接口 | 请求需签名(参数排序→SHA1→MD5);海外 IP 响应慢,超时放宽 15s,兜底新浪财经 7x24 快讯 |
| 豆瓣电影·新片榜 | 书影 | movie.douban.com 官方页面 | chart 页解析 |
| 微信读书·飙升榜 | 书影 | weread.qq.com 官方接口 | bookListInCategory |
| 虎扑·步行街热帖 | 体育 | m.hupu.com 官方接口 | topicThreads |

### 不可直连的来源(2026-09 实测,勿重复踩坑)

- **Bing 热榜**:趋势 carousel 接口需登录态参数,匿名请求返回空,无稳定直连通道。
- **Meta 系**:Facebook Trends 2018 年已下线;Instagram/Threads 趋势均需登录态。
- **YouTube**:对 Cloudflare 等数据中心 IP 全链路封锁——trending 页返回空壳 ytInitialData、
  youtubei 内部 API 三种客户端(ANDROID/IOS/WEB)一律 400;公共 Invidious/Piped 实例也已
  消亡(DNS 污染/403/401)。如需接入,须自备住宅代理出口或真实登录态,与全自托管原则冲突。
- **36氪**:RSS/快讯 API 全部 SPA 化且网关接口需签名。

## 缓存与容错

```
请求 → 内存缓存(TTL 5min, 同 Isolate)
     → KV 缓存(可选, 跨实例共享)
     → 源站直连(多端点依次回退, in-flight 去重防惊群)
     → 失败 → 过期缓存(stale:true) → 如实报错
```

- TTL 由 `CACHE_TTL` 控制（默认 300 秒）；`?refresh=1` 可强制刷新
- Workers 部署建议开启 KV 与 cron 预热；Pages 无 cron，靠请求时刷新

## 自维护指南

- **加新平台**：在 `src/fetchers/` 实现一个 `fetchXxx(): Promise<HotItem[]>`（多端点用 `firstOk()` 包裹），到 `src/registry.ts` 登记 id/名称/分类。路由、缓存、界面自动生效。
- **修坏掉的平台**：先跑 `npm run test:fetchers -- --platform <id>` 复现；通常是源站改了返回结构或加了风控，对照 `src/fetchers/<id>.ts` 里的通道顺序调整端点或解析。
- **隔离原则**：单个平台抓不通只影响自己（其余平台正常返回），不要为救一个平台在公共路径上加第三方兜底。

## 本地 CLI 模式（可选）

`scripts/fetch_local.py` 为零依赖 Python 直连脚本（7 个核心平台），用于无部署环境的本地兜底：

```bash
python3 scripts/fetch_local.py --platform weibo,zhihu --max 10 --keyword AI
```

## 说明

- 热榜数据默认缓存 5 分钟，非秒级实时；时效敏感场景请标注 `update_time`。
- 本项目只做**聚合与结构化**，不存储、不代理任何正文内容；各条目版权归原作者与所属平台。
- 内容创作场景可配合 [wewrite-draft-gateway](https://github.com/wimdaw/wewrite-draft-gateway) 完成「热点 → 选题 → 排版 → 公众号草稿」全链路。

## License

MIT
