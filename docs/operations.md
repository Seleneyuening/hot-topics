# NowTide 部署与维护

## 上游审计

初始版本基于上游 `5e528a4`。上游采用 TypeScript、Hono、esbuild 和 Wrangler，实现 34 个榜单以及一个原生 HTML 页面。原脚本输出纯 API Worker 和高级模式 Pages。NowTide 用同一个 Worker 提供静态资源、API、Cron 和 KV 访问，减少部署目标，实现同源访问。保留上游解析、注册表和界面，用独立的 `src/schedule.ts` 和 `src/cache.ts` 管理策略及状态。

上游配置曾包含明文鉴权值和原作者 KV 绑定。当前配置绑定 NowTide 专用 KV，历史提交按要求保留。上游历史里的值应由原作者撤销，切勿复用。公开接口只读已发布缓存。它无需 API Key，访客也不能通过参数或按钮触发抓取。

### 重点源的一次性匿名诊断

北京时间 2026-11-22，macOS 环境。

| 榜单 | 实测 | 生产设置 |
| --- | --- | --- |
| 小红书 | `edith.xiaohongshu.com` 返回 HTTP 406，响应中 `data` 为空。官方探索页没有本榜的数据 | 从 Worker 做一次匿名探测，遇明确拒绝自动暂停；页面保留官方入口。上游固定设备、会话和签名头已移除 |
| 微博 | 无请求头的桌面探测为 403，移动端为 432，公开热搜页重定向访客验证。一次带普通 Referer 和 NowTide 标识的桌面诊断返回 50 条 | 桌面及移动域名的通用 robots 指令限制自动访问，且服务协议要求遵守书面许可条款。维持暂停 |
| 知乎 | 匿名接口返回 50 条并通过解析 | 对通用爬虫的 robots 指令限制该路径，维持暂停 |
| B 站热搜 | 修正上游的空数组候补逻辑后，站内热搜匿名解析出 50 条 | 使用 `s.search.bilibili.com` 的匿名端点。无设备 Cookie 或三方回退 |
| B 站热门视频 | 一次无自定义请求头的匿名诊断收到 API 数据，随后正常标识的诊断返回业务错误 `-352`；SSR 页面未返回可解析榜单 | `api.bilibili.com` robots 限制自动访问，维持暂停，页面保留官方入口 |
| 百度 / 抖音 | 解析得到 50 / 49 条 | 定时直连 |
| GitHub Trending | 官网 Trending 页面解析得到 16 条 | 定时抓取公开页面 |

微博、知乎、小红书或热门视频要恢复自动采集，优先向平台申请书面许可或使用其正式开放接口。小红书公开开放平台文档主要覆盖商家接口，本次未找到面向一般开发者的公开热搜 API。平台有授权数据商时，可在确认授权范围后接入，并标明实际提供者。

上游微信公众号榜单来自 TopHub，X 趋势来自 Trends24，均作为第三方来源展示且暂停。上游 B 站热搜和热门视频有 TopHub 回退，当前发布链路已移除；原财联社实现依赖客户端签名，并以新浪财经快讯回退，榜单来源和内容语义不同，因此保留为暂停项。其余启用的抓取器请求各自来源，无需付费聚合 API。
[小红书开放平台](https://school.xiaohongshu.com/en/open/index.html) · [微博使用协议](https://www.weibo.com/signup/v5/protocol/) · [知乎 robots.txt](https://www.zhihu.com/robots.txt) · [B站 API robots.txt](https://api.bilibili.com/robots.txt)

### 首发验收记录

北京时间 2026-11-22 00:41–00:45，Cloudflare Cron 日志和公网 API 确认：

- 小红书返回 HTTP 406；B 站热搜返回 HTTP 412。两项都在生产标记为不可用，并暂停后续请求。本地 B 站热搜可解析 50 条，说明本地结果无法代表云端可用性。
- 抖音成功返回 49 条，百度 50 条，GitHub Trending 16 条。Cron 日志记录了源域名及条数。连续六次读取抖音 API（部分含旧的强制刷新参数）共用同一快照，最近尝试和最后成功时间均未改变。
- 微博和知乎只进行了本地匿名诊断。生产中的状态是因访问政策暂停，页面保留对应入口。
- 其余 23 个启用抓取器在本地测试中有 19 个返回了条目。快手和线报酷返回内容但未解析出榜单；美国之音和德国之声未通过网络或内容校验。低频源的生产可用性以各自 Cron 结果为准。
- 公网页面通过桌面、iPhone 和 iPad 视口模拟，检查了 34 张卡片、分类及平台筛选、主题切换和横向溢出。未使用实体移动设备。
- GitHub 的独立验证及每日上游检查工作流均运行成功。上游当时无新增提交，未触发真实同步 PR。主分支推送触发了发布工作流，其凭据检查因缺少 `CLOUDFLARE_API_TOKEN` 而停止；首发版本经本机 Wrangler OAuth 上传。
[生产状态](https://nowtide.liwangjing200.workers.dev/api/all?limit=1) · [GitHub Actions](https://github.com/Seleneyuening/hot-topics/actions)

## 网页、缓存与抓取

| 项目 | 配置 |
| --- | --- |
| 网页自动读取 | 每 5 分钟读取一次快照，可关闭；手动刷新也只读取 KV |
| 读取缓存 | 已解析的 KV 快照可在 Worker 实例中复用 30 秒。KV 跨区域传播通常需要一定时间 |
| 榜单有效期 | 从最近成功抓取时间起算，等于该榜的采集周期。到期或本轮失败时显示过期，旧条目保留，同时显示错误及最后成功时间 |
| 抓取周期 | 三组分别于每个五分钟窗口的第 0、1、2 分钟执行。百度、抖音、B站热搜每 5 分钟，GitHub 每 15 分钟，其余启用榜单每 60 分钟交错安排。小红书遇拒绝即暂停 |
| 失败处理 | 单次上游请求默认 8 秒超时，同源备选有上限。普通失败按指数退避至最多 6 小时，下一个候选时段才重试。HTTP 429 冷却至少 1 小时，明确拒绝时停止自动采集 |
| KV 额度 | 每组每个窗口最多写入 1 次，共 3 × 288 = 864 次/日，低于同账户 1,000 次/日硬上限。总览最多取三个 KV 键，无实例缓存命中时约 33,000 次总览请求/日触达 100,000 KV 读取上限。Worker 自身另有 100,000 请求/日的上限 |

账户内其他项目共用额度。免费版单次触发还有 10 ms CPU 和 50 个子请求约束。部署后可在 Workers Logs 查看超限，必要时减少同一组中昂贵的榜单。若整个分组未能写入，页面按上一份快照的到期时间显示过期。首次启用后，Cron 变更传播可能需要 15 分钟，低频榜单随后在各自时段建立缓存。
[Workers 限额](https://developers.cloudflare.com/workers/platform/limits/) · [KV 限额](https://developers.cloudflare.com/kv/platform/limits/) · [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## 部署与回滚

生产使用 `wrangler.toml` 指定的 NowTide KV。另行部署到其他 Cloudflare 账户时，先启用 Workers 的 `workers.dev` 子域，使用 `npx wrangler kv namespace create nowtide-snapshots` 创建 KV，替换配置中的命名空间 ID。命名空间 ID 是资源标识。API 令牌只保存在本地授权环境或 GitHub Actions Secrets。

- 手动发布。先完成 Wrangler OAuth 登录，再运行 `npm run deploy`。若 shell 中已存在另一个权限不足的 `CLOUDFLARE_API_TOKEN`，执行 `env -u CLOUDFLARE_API_TOKEN npm run deploy` 使用已有 OAuth。多账户时同时设置 `CLOUDFLARE_ACCOUNT_ID`。
- 自动发布。为 Fork 设置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 两个 Actions Secrets。令牌只限定到目标账户，授予 Account Settings Read、Workers Scripts Edit 和 Workers KV Storage Edit。主分支推送及手动运行 **Deploy NowTide** 会先检查类型、构建和快照测试，再发布 Worker 与静态页面。同一时刻只发布一个版本。
- 构建、测试或上传失败。修复后重跑该工作流；这些阶段未切换生产版本。
- 已发布版本异常。在 Cloudflare 的 Worker Deployments 页面选择最近可用版本回滚。保持 KV 格式向后兼容，同时检查回滚后的 Cron 配置。Cron 和 KV 并非随代码版本一起恢复的历史快照。
- 排查。查看 `/healthz`、`/api/all?limit=1` 和 `/api/<平台>` 的 `status`、`attempted_at`、`update_time` 和 `error`，在 Workers Logs 搜索 `feed-success` 或 `feed-error`。恢复被禁用平台前先确认许可或接入合规源，再更新抓取策略。若需要清除单后台分组的小流量旧快照，在维护窗口重建该分组的 KV 键，注意这会暂时清除同组榜单的缓存。

## 上游同步

本地仓库的 `origin` 指向 Fork，`upstream` 指向原仓库。GitHub Actions **Check upstream** 每日北京时间约 09:47 运行，也可手动执行。发现新提交后，先在只读 runner 上试合并并检查类型、构建和模拟抓取。另一个只执行 Git 操作的 job 以该上游提交创建草稿 PR，附上验证详情，即使冲突也会保留 PR 供审阅。首次使用前需允许 Actions 创建 PR，设置入口是 Fork 的 **Settings → Actions → General**。

审核后用 **Create a merge commit** 合并，保留上游提交的祖先关系，避免下次重复发现同一更新。主分支的合并和站点发布分别执行。若上游引入 GitHub 工作流文件，GitHub 可能拒绝默认令牌推送这类改动；此时在本地审核新增工作流后，使用有 workflow 权限的身份创建同步分支及 PR。每日日程可能因 GitHub 公共 Fork 的活动规则被暂停，可在 Actions 页面重新启用。

```bash
git fetch upstream
git log --oneline main..upstream/main
npm run typecheck && npm run build && npm test
```
