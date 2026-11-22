import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker from '../dist/worker.js'

test('Worker cron fetches a snapshot; HTTP requests only read it', async () => {
  const originalFetch = globalThis.fetch
  const tickTime = Date.parse('2026-11-22T00:06:00Z')
  const records = new Map()
  let writes = 0
  let fetches = 0
  let biliFetches = 0
  let fail = false
  const env = {
    KV: {
      async get(key) { return records.get(key) ?? null },
      async put(key, value) { writes++; records.set(key, JSON.parse(value)) },
    },
  }
  globalThis.fetch = async (input) => {
    fetches++
    const url = new URL(input)
    if (url.pathname === '/api/v1/articles' && url.hostname === 'new.xianbao.fun') {
      return Response.json({ code: 0, data: { items: [{ title: 'API &amp; fixture', url: 'https://new.xianbao.fun/xiaodigu/1.html' }] } })
    }
    if (url.hostname === 's.search.bilibili.com') {
      biliFetches++
      if (fail) return new Response(null, { status: 412 })
      return Response.json({ top_list: [], list: [{ show_name: 'fixture', keyword: 'fixture', heat_score: 123 }] })
    }
    return new Response(null, { status: 403 })
  }
  const get = async (path) => {
    const response = await worker.fetch(new Request(`https://worker.test${path}`), env)
    assert.equal(response.status, 200)
    return (await response.json()).data
  }
  const tick = (time) => new Promise((resolve) => {
    worker.scheduled({ cron: '1-59/5 * * * *', scheduledTime: time }, env, { waitUntil: resolve })
  })
  try {
    assert.equal((await get('/api/bilibili')).status, 'pending')
    assert.equal(fetches, 0)
    await tick(tickTime)
    const refreshed = await get('/api/bilibili')
    assert.equal(refreshed.status, 'fresh')
    assert.equal(refreshed.items[0].hot, 123)
    assert.ok(refreshed.update_time && refreshed.attempted_at)
    const originalFetches = fetches
    await tick(tickTime)
    assert.equal(writes, 1)
    for (const path of ['/api/all', '/api/category/%E7%A4%BE%E5%8C%BA', '/api/bilibili?refresh=1']) {
      await get(path)
    }
    assert.equal(fetches, originalFetches)
    fail = true
    await tick(tickTime + 300_000)
    const stale = await get('/api/bilibili')
    assert.equal(stale.status, 'stale')
    assert.match(stale.error, /412/)
    assert.equal(stale.update_time, refreshed.update_time)
    assert.deepEqual(stale.items, refreshed.items)
    await tick(tickTime + 600_000)
    assert.equal(biliFetches, 2)

    records.set('nowtide:v1:0', {
      tick: Math.floor(tickTime / 300_000) - 1,
      entries: { xianbao: { items: [], successAt: null, attemptedAt: Date.now(), error: '旧抓取器故障', failures: 6, retryAt: Date.now() + 3600_000 } },
    })
    await new Promise((resolve) => {
      worker.scheduled({ cron: '*/5 * * * *', scheduledTime: tickTime - 60_000 }, env, { waitUntil: resolve })
    })
    const recovered = await get('/api/xianbao')
    assert.equal(recovered.status, 'fresh')
    assert.equal(recovered.items[0].title, 'API & fixture')
  } finally {
    globalThis.fetch = originalFetch
  }
})
