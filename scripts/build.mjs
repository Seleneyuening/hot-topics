/**
 * 构建脚本:同时输出 Cloudflare Workers 与 Pages 双产物
 *   dist/worker.js        -> Workers (wrangler deploy)
 *   dist/pages/_worker.js -> Pages 高级模式 (wrangler pages deploy)
 *   dist/pages/index.html -> Pages 静态界面 (经 _worker.js 的 ASSETS 回退提供)
 */
import { build } from 'esbuild'
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs'

mkdirSync('dist/pages', { recursive: true })

/** @type {import('esbuild').BuildOptions} */
const common = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: true,
}

await build({ ...common, outfile: 'dist/worker.js' })
await build({ ...common, outfile: 'dist/pages/_worker.js' })

// 拷贝静态界面到 Pages 产物目录(内容级拷贝,避免目录嵌套)
cpSync('public', 'dist/pages', { recursive: true })

console.log('\n✅ 产物构建成功:')
console.log('   dist/worker.js         (Cloudflare Workers)')
console.log('   dist/pages/_worker.js  (Cloudflare Pages,API + ASSETS 回退)')
for (const f of readdirSync('dist/pages')) {
  if (!statSync(`dist/pages/${f}`).isDirectory() && f !== '_worker.js') {
    console.log(`   dist/pages/${f}`.padEnd(23) + '(Pages 静态资源)')
  }
}
