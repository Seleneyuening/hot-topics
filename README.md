# NowTide

NowTide 基于 [wimdaw/hot-topics](https://github.com/wimdaw/hot-topics) 的 MIT 许可版本，保留上游 Git 历史、抓取器注册表和网页界面。网页支持分类、单平台筛选、关键词、明暗主题和 Markdown 导出。许可证与作者署名保存在 [LICENSE](LICENSE)。

- [打开 NowTide](https://nowtide.liwangjing200.workers.dev/)
- [部署及维护说明](docs/operations.md)
- [查看缓存及抓取状态](https://nowtide.liwangjing200.workers.dev/api/all?limit=1)

使用 Node.js 24 与 npm。

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run dev
```

运行 `npm run test:fetchers -- --platform baidu,douyin,bilibili,github` 可进行一次真实网络探测。它使用运行命令所在环境的网络，生产结果以网站的时间戳和 Workers Logs 为准。
