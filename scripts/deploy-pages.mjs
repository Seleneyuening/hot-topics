/**
 * Pages 部署脚本:绕过「Pages 不支持自定义 wrangler 配置路径」的限制。
 *
 * Cloudflare Pages 命令只读取根目录的 wrangler.toml,而本仓库的 wrangler.toml 是
 * Workers 配置。因此部署 Pages 时临时交换两个配置文件,让携带 KV 绑定的
 * wrangler.pages.toml 以 wrangler.toml 的身份生效,结束后按相反顺序还原。
 *
 * 注意:还原必须用 exitCode 而非 process.exit() —— 后者不会执行 finally。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, renameSync } from 'node:fs'

const workerCfg = 'wrangler.toml'
const pagesCfg = 'wrangler.pages.toml'
const bakWorker = '.deploy-bak.wrangler.toml'
const bakPages = '.deploy-bak.wrangler.pages.toml'

/** 若上次部署异常中断留下交换状态,先恢复现场 */
function recoverIfInterrupted() {
  // pages 配置顶名 wrangler.toml 且备份还在 → 说明上次没走完 finally
  if (existsSync(workerCfg) && !existsSync(pagesCfg) && existsSync(bakWorker)) {
    renameSync(workerCfg, pagesCfg)
    renameSync(bakWorker, workerCfg)
    console.log('ℹ️  检测到上次中断的交换状态,已恢复配置文件')
  }
  // 只剩孤立备份(极端情况)
  if (!existsSync(workerCfg) && existsSync(bakWorker)) renameSync(bakWorker, workerCfg)
  if (!existsSync(pagesCfg) && existsSync(bakPages)) renameSync(bakPages, pagesCfg)
}

// 先恢复可能中断的交换状态,再做存在性检查
recoverIfInterrupted()

for (const f of [workerCfg, pagesCfg]) {
  if (!existsSync(f)) {
    console.error(`✘ 缺少 ${f}(若为部署中断所致,可用 git checkout 还原这两个配置文件)`)
    process.exit(1)
  }
}

let exitCode = 0
try {
  renameSync(workerCfg, bakWorker)
  renameSync(pagesCfg, workerCfg)

  const res = spawnSync('npx', ['wrangler', 'pages', 'deploy', 'dist/pages', '--branch=main', '--commit-dirty=true'], {
    stdio: 'inherit',
  })
  exitCode = res.status ?? 1
} catch (err) {
  console.error('✘ 部署异常:', err instanceof Error ? err.message : err)
  exitCode = 1
} finally {
  // 按交换的相反顺序还原(此时 wrangler.toml 是 pages 配置,bakWorker 是 workers 配置)
  if (existsSync(workerCfg) && existsSync(bakWorker)) renameSync(workerCfg, pagesCfg)
  if (existsSync(bakWorker)) renameSync(bakWorker, workerCfg)
  console.log('ℹ️  wrangler 配置已还原(wrangler.toml=Workers, wrangler.pages.toml=Pages)')
}

process.exitCode = exitCode
