# hot-topics

**全网热点聚合 Agent 技能** —— 一条命令拉取**微博 / 知乎 / 百度 / 抖音 / 今日头条 / 小红书 / B站 / 腾讯新闻 / 微信公众号**实时热榜，结构化输出（标题 / 热度 / 链接），作为「热点追踪 → 文章选题 → 内容创作」的第一步。

零依赖（纯 Python 标准库）、免 API Key、免本地部署。可直接当命令行工具用，也可作为 Claude Code / Hermes 等 Agent 的技能（Skill）挂载。

> 改编自 skillhub [@vikiboss/web-hot](https://github.com/vikiboss/60s)，数据源为 [60s](https://github.com/vikiboss/60s) 公共聚合 API 与 [今日热榜 tophub.today](https://tophub.today)。

---

## 它能做什么

| 模式 | 触发场景 | 输出 |
|------|----------|------|
| **全平台热榜** | 「今日热点」「微博热搜」「有什么热搜」 | 9 个平台各一份 TOP-N 列表（标题/热度/链接） |
| **关键词筛选** | 「今天关于 AI 的热点」 | 全平台命中关键词的条目 |
| **板块精确热点** | 「手机热点」「板块 TOP10」 | 手机/电脑/AI/机器人/汽车/科技 六大板块候选池，含型号提取 |

## 快速开始

### 方式 A：直接当命令行工具用

```bash
git clone https://github.com/wimdaw/hot-topics.git
cd hot-topics

# 全平台热榜（每平台默认 TOP 50）
python3 scripts/fetch_60s.py

# 常用参数
python3 scripts/fetch_60s.py --max 10                    # 每平台只取前 10 条
python3 scripts/fetch_60s.py --platform weibo,zhihu       # 只拉指定平台
python3 scripts/fetch_60s.py --keyword AI                 # 按关键词筛选标题

# 板块精确模式（手机/电脑/AI/机器人/汽车/科技 六大板块候选池）
python3 scripts/fetch_sectors.py --max-per-source 50
```

输出为**逐行 JSON**（每平台一行，便于管道处理）：

```json
{"platform": "weibo", "items": [{"title": "男子编造停捐遭威胁事件被抓", "hot": 1162167, "url": "https://s.weibo.com/weibo?q=..."}]}
{"platform": "zhihu", "items": [{"title": "如何看待红果短剧日活1.68亿…", "hot": "", "url": "https://www.zhihu.com/question/..."}]}
```

失败的平台走 stderr 输出 `{"platform": "...", "error": "..."}`，末尾有汇总 `# summary: ok=N failed=N`，**绝不伪造数据**。

### 方式 B：作为 Agent 技能挂载

**Claude Code：**

```bash
git clone https://github.com/wimdaw/hot-topics.git ~/.claude/skills/hot-topics
# 或已克隆的情况下
cp -r hot-topics ~/.claude/skills/hot-topics
```

**其他兼容 SKILL.md 规范的 Agent**（Hermes、ZCode 等）：把本目录放进对应技能目录即可，例如 `~/.agents/skills/hot-topics`。

装好后对 Agent 说：

> 今天有什么热点？
> 板块热点，给我手机板块 TOP10
> 用今天的热点给我拟 5 个公众号文章标题

Agent 会按 [SKILL.md](SKILL.md) 定义的流程调用脚本并整理输出。

## 数据源与容错（2026-09 实测）

### 60s 聚合 API（多实例故障转移）

⚠️ 官方实例 `60s.viki.moe` 自 2026-09 起限流严格、常返 **403**。脚本内置**官方 + 7 个社区实例**自动故障转移（[社区实例名单](https://docs.60s-api.viki.moe/7306811m0)），任一可用即停，同一轮运行内优先复用最近成功的实例。

| 平台 | 端点 | 说明 |
|------|------|------|
| 微博 | `/v2/weibo` | title, hot_value, link |
| 知乎 | `/v2/zhihu` | title, detail, link |
| 百度 | `/v2/baidu/hot` | rank, title, desc |
| 抖音 | `/v2/douyin` | title, hot_value, link |
| 今日头条 | `/v2/toutiao` | title, hot_value, link |
| 小红书 | `/v2/rednote` | 部分旧版实例缺此端点（500），自动切换 |
| B站 | `/v2/bili` | 源站偶发 500，失败如实标注 |

### tophub.today（榜单 + 兜底）

| 平台 | 板块 | 说明 |
|------|------|------|
| 腾讯新闻 | `/n/12owgX0oNV` | 无热度数值，按位次 |
| 微信公众号 | `/n/WnBe01o371` | 含阅读量（如 10.0万） |
| 微博 / 知乎 / 百度 / B站 | 见 SKILL.md | **60s 全实例失败时自动回落到 tophub** |

解析器只认页面第一个 `<table>` 的 `<a>` 条目与纯数字热度——不会把页面脚本里的 JS 模板残渣当成数据，且能带出每条的真实链接。

### 垂直媒体 RSS（板块模式补充）

IT之家（`ithome.com/rss`）、36氪（`36kr.com/feed`）、爱范儿（`ifanr.com/feed`）。

## 输出字段说明

| 字段 | 说明 |
|------|------|
| `title` | 条目标题（已清洗，无 HTML） |
| `hot` | 热度，平台原始口径（数值或 `"947.5w"`、`"10.0万"`），**跨平台不可直接比较** |
| `url` | 条目链接（tophub 源带原始出站链接；60s 的百度/知乎等部分平台为搜索页链接） |
| `sectors` | （板块模式）命中的板块：手机/电脑/AI/机器人/汽车/科技 |
| `models` | （板块模式）正则提取到的手机/电脑型号，如 `iPhone 18 Pro` |

## 排错

| 现象 | 原因与处理 |
|------|-----------|
| 某平台 `HTTP 403` | 该 60s 实例限流，脚本会自动换实例；单平台失败不影响其他平台 |
| 小红书整轮失败 | 部分社区实例版本旧、无 rednote 端点，重跑一次通常命中可用实例 |
| tophub 条目为空 | 页面结构再变，重跑；持续为空请提 issue |
| 全部失败 | 检查出口网络对 `60s.*` / `tophub.today` 的可达性 |

## 项目结构

```
hot-topics/
├── README.md              # 本文件（人用的说明）
├── SKILL.md               # Agent 技能定义（触发词、执行流程、输出规范）
└── scripts/
    ├── fetch_60s.py       # 全平台热榜抓取（60s 多实例 + tophub 兜底）
    └── fetch_sectors.py   # 板块精确模式（聚合全源 + 板块打标 + 型号提取）
```

## 说明

- 热榜数据有 5–15 分钟缓存，非秒级实时；时效敏感场景请标注抓取时间。
- 本项目只做**聚合与结构化**，不存储、不代理任何正文内容；各条目版权归原作者与所属平台。
- 个人订阅号等内容创作场景可配合 [wewrite-draft-gateway](https://github.com/wimdaw/wewrite-draft-gateway) 完成「热点 → 选题 → 排版 → 公众号草稿」全链路。

## License

MIT
