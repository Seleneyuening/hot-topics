---
name: hot-topics
description: 'Use when 用户要今日热点/热榜/热搜. 聚合微博/知乎/百度/抖音/头条/小红书/B站/腾讯/快手等实时热点并结构化输出。'
version: 2.0.0
author: Hermes Agent, 大大怪将军定制
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [hot-topics, trending, hot-search, china, content-creation]
    related_skills: [hot-topics-harvester]
---

# 全网热点提取 Skill (hot-topics)

数据来自**自托管热点网关**（hot-topics 项目部署的 Cloudflare Workers/Pages，见仓库 README）。网关直连各平台官方公开接口抓取 **微博 / 知乎 / 百度 / 抖音 / 今日头条 / 快手 / 小红书 / B站(热搜+热门) / 贴吧 / 腾讯新闻 / 网易新闻 / 澎湃 / 微信公众号热文 / IT之家 / 爱范儿 / 少数派 / GitHub Trending / Hacker News / X(推特)热榜 / 美国之音 / BBC中文 / 德国之声 / 法广 / 联合早报 / 线报酷 / 虎嗅 / 掘金 / V2EX / 知乎日报 / 财联社 / 豆瓣电影 / 微信读书 / 虎扑** 实时热点，**不依赖 60s 等第三方聚合服务**，部署后可自维护。

## When to Use

- 触发词：**今日热点 / 热点 / 热榜 / 热搜 / 今天有什么热搜 / 微博热搜 / 知乎热榜 / 小红书热点 / 抖音热榜 / 板块热点 / 板块TOP10** 等。
- 用于：提取当日全网热点（含平台、热度、链接），为文章选题与创作提供素材。
- 可选：用户给出行业/关键词（如"AI"、"汽车"）时，按关键词筛选热点并产出选题方向。
- **Don't use for:** 深度新闻正文阅读（本技能只给标题/摘要/链接）；跨多日趋势对比（仅当日快照）。

## 数据获取（网关优先，本地脚本兜底）

### 方式 A：自托管网关（首选）

网关地址与 Key 由部署决定，按顺序取：环境变量 `HOT_TOPICS_API` / `HOT_TOPICS_KEY` → 默认空。**网关启用了 API Key 鉴权：所有 /api/* 调用必须追加 `?key=$HOT_TOPICS_KEY`，缺失或错误返回 401**。无网关地址时走方式 B。

```bash
# 全平台(约 34 个榜),数据在网关侧缓存 5 分钟
curl -s "$HOT_TOPICS_API/api/all?limit=50&key=$HOT_TOPICS_KEY"

# 单平台:weibo zhihu baidu douyin toutiao kuaishou rednote bilibili bilibili-video tieba tencent netease thepaper weixin ithome ifanr sspai github hackernews x voa bbc dw rfi zaobao xianbao huxiu juejin v2ex zhihudaily cls douban-movie weread hupu
curl -s "$HOT_TOPICS_API/api/weibo?limit=50&key=$HOT_TOPICS_KEY"

# 平台清单 / 健康检查(healthz 免鉴权)
curl -s "$HOT_TOPICS_API/api/platforms?key=$HOT_TOPICS_KEY"
curl -s "$HOT_TOPICS_API/healthz"
```

响应结构（`/api/all` 逐平台容错，单平台失败不影响其他平台）：

```json
{"code": 200, "timestamp": "...", "ok": 17, "failed": 0, "data": [
  {"platform": "weibo", "name": "微博热搜", "category": "综合", "update_time": "ISO8601",
   "total": 50, "items": [{"title": "...", "hot": 1162167, "url": "https://..."}], "stale": false}
]}
```

- `hot` 为平台原始口径（数值 / `"947.5w"` / `"10.0万"`），**跨平台不可直接比较**。
- `stale: true` 表示源站抓取失败、本次返回的是网关缓存旧数据，如实向用户标注。
- 单平台 `error` 非空时该榜无数据，禁止编造。

### 方式 B：本地直连脚本（无网关时的兜底）

```bash
python3 scripts/fetch_local.py                 # 全平台(7 个直连榜)
python3 scripts/fetch_local.py --platform weibo,zhihu --max 10 --keyword AI
```

输出逐行 JSON `{"platform": "weibo", "items": [{"title", "hot", "url"}]}`，失败平台走 stderr 并有末尾汇总，**绝不伪造数据**。

## 执行流程

1. 获取当前日期时间（`date`），锁定"今日"快照时间。
2. 按上面方式 A/B 拉数据（网关一次 `/api/all` 即可；脚本逐平台容错）。
3. 单平台排序：有热度数值按数值降序；无数值（腾讯/网易/澎湃/公众号热文等）按榜单位次。
4. 跨平台去重：同一话题在多平台出现 → 合并为一条并标注「多平台热榜（微博/抖音…）」，保留最高热度值。
5. 若用户给了行业/关键词：筛选命中条目，另列「选题池」。
6. 按下节格式输出。

## 六大板块精确模式（板块TOP10）

触发：用户说「板块热点 / 板块TOP10 / 手机热点 / AI热点 / 汽车热点」等。v2 起板块打标由 **agent 侧**完成（网关数据已含科技源，无需脚本）：

1. 拉 `/api/all`（含 weibo/zhihu/baidu/douyin/toutiao/rednote/tencent/ithome/ifanr/sspai 等）。
2. 按下方关键词把条目打上板块标签（可多标签），再按**归板块优先级**归唯一板块。
3. 每板块按热度排序（无数值按位次），取 TOP10；跨源同话题去重；不足 10 条如实标注，禁止凑数。

### 板块关键词参考

| 板块 | 命中词（含即打标） |
|------|------|
| 手机 | 手机/旗舰/芯片(手机语境)/iPhone/荣耀/华为 Mate|Pura/小米 数字|Ultra|Civi/OPPO/vivo/iQOO/一加/红米/真我/折叠屏 |
| 电脑 | 笔记本/电脑/显卡/CPU/RTX/RX /联想/戴尔/惠普/华硕/ThinkPad/MacBook/Mac/mini主机/路由器 |
| AI | AI/大模型/LLM/GPT/DeepSeek/通义/豆包/Kimi/智能体/Agent/文生图/文生视频/算力/英伟达 |
| 机器人 | 机器人/人形/宇树/具身智能/无人机/自动驾驶(偏车则归汽车)/Robotaxi |
| 汽车 | 车/汽车/新能源/比亚迪/小米汽车/问界/蔚来/理想/小鹏/吉利/智驾/电池/固态电池 |
| 科技 | 其他科技数码(半导体/卫星/操作系统/互联网行业动态) |

### 归板块优先级（多标签时定唯一板块）

**机器人 > 手机 > 电脑 > 汽车 > AI > 科技**

- 例：「宇树科技人形机器人/IPO」→ 机器人；「荣耀 Robot Phone 手机」→ 手机；「比亚迪 AI 团队自研芯片」→ 汽车；「AI 大模型落地汽车座舱」→ 汽车；「NVIDIA AI GPU」→ 科技。
- 例外：标题核心为手机/电脑产品（含型号）时优先归 手机/电脑，即使含 AI/芯片词。
- 手机/电脑板块需**型号全量收录**：标题中出现具体机型即纳入候选（上限 10 条按热度排，超出时标注「当日涉及 N 款机型」）。

## 输出格式规范

```
📊 全网热点速览 | YYYY-MM-DD HH:MM
数据说明：自托管网关直连各平台官方接口；热度值为平台原始口径，跨平台不直接比较；失败/缓存平台如实标注。

🔥 跨平台高热话题 TOP（多平台同时上榜）
1. 话题标题 —— 微博 552万 / 抖音 1417万（多平台热榜）
...

【微博热搜 TOP10】  （各平台小节，格式同下）
1. 标题
- 热度：XXX | 来源：微博 | 链接：xxx
...

【知乎热榜 TOP10】
...
```

板块模式输出：

```
📊 今日六大板块热点 TOP10 | YYYY-MM-DD HH:MM
数据说明：网关聚合热榜 + 科技源；热度为平台原始口径；不足10条如实标注。

📱 手机板块 TOP10（当日涉及机型 N 款）
1. 标题（型号）
- 热度：xxx | 来源：xxx
...
```

板块图标：📱手机 / 💻电脑 / 🔬科技 / 🧠AI / 🤖机器人 / 🚗汽车。

### 选题创作模式（配合文章标题/内容创作）

用户给出行业/关键词时，在标准输出后追加：

```
🎯 选题池（关键词：AI）
1. [话题]（微博 552万）→ 选题方向：...
```
- 选题方向只基于话题本身做客观衍生，**不虚构事实、不夸大热度**；默认给 3 条候选标题方向。

## Pitfalls

- **绝不伪造数据**：某平台 `error`/抓取失败 → 标注「XX 数据获取失败」，禁止用旧数据或编造填补。
- **stale 数据要标注**：网关返回 `stale: true` 时说明是缓存旧数据，注明「缓存数据，约 N 分钟前」。
- **热度口径不一**：数值 / 万亿缩写 / 位次，跨平台不可直接比较，输出必须标注来源平台。
- **板块归类靠优先级**，不要机械取第一个标签；手机/电脑型号全量收录。
- **内容性质**：热榜含时政、娱乐八卦等，不属于六大板块的如实略过；用于文章创作时由用户自行判断合规与客观性。
- **缓存周期**：网关缓存 5 分钟（`CACHE_TTL`），非秒级实时；时效要求极高时注明 `update_time`。

## Verification

- 通用模式：至少 5 个平台返回成功数据；`/api/all` 的 `failed` 与实际报错平台一致。
- 板块模式：六大板块均给出候选；手机/电脑板块给出当日涉及机型清单。
- 每条含标题 + 来源平台；有热度值的含热度。
- 部署可用性验证：`curl -s $HOT_TOPICS_API/healthz` 返回 `{"ok": true}`。
