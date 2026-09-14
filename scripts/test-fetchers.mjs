/**
 * Fetcher 冒烟测试:在本地 Node(>=18)环境逐个调用平台抓取函数,
 * 输出各平台条数与耗时,用于上线前验证端点可用性。
 *
 *   npm run test:fetchers [-- --platform weibo,zhihu] [-- --rounds 2]
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2)
const platformArg = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : null
const rounds = args.includes('--rounds') ? Number(args[args.indexOf('--rounds') + 1]) || 1 : 1

mkdirSync('.test-tmp', { recursive: true })

await build({
  entryPoints: ['src/registry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: '.test-tmp/registry.test.mjs',
  logLevel: 'silent',
})

const { PLATFORMS } = await import('../.test-tmp/registry.test.mjs')

const selected = platformArg
  ? PLATFORMS.filter((p) => platformArg.split(',').map((s) => s.trim()).includes(p.id))
  : PLATFORMS

let ok = 0
const failed = []

for (let r = 1; r <= rounds; r++) {
  console.log(`\n—— 第 ${r}/${rounds} 轮 ——`)
  for (const p of selected) {
    const t0 = Date.now()
    try {
      const items = await p.fetcher()
      ok++
      console.log(`✅ ${p.id.padEnd(16)} ${String(items.length).padStart(3)} 条  ${Date.now() - t0}ms  (首条: ${items[0]?.title?.slice(0, 30) || '-'})`)
    } catch (e) {
      failed.push(p.id)
      console.log(`❌ ${p.id.padEnd(16)} ${Date.now() - t0}ms  ${e.message}`)
    }
  }
}

console.log(`\n汇总: ${ok} 次成功, ${failed.length} 次失败${failed.length ? ` → ${[...new Set(failed)].join(', ')}` : ''}`)
process.exit(failed.length && ok === 0 ? 1 : 0)
