export const UA_CHROME = 'NowTide/1.0 (+https://github.com/Seleneyuening/hot-topics)'
export const UA_IOS = UA_CHROME

const DEFAULT_TIMEOUT_MS = 8000

export function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { 'User-Agent': UA_CHROME, ...init?.headers },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  })
}

class UpstreamHttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} (${hostOf(url)})`)
  }
}

export async function getJson<T = any>(url: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs)
  if (!res.ok) {
    await res.body?.cancel()
    throw new UpstreamHttpError(res.status, url)
  }
  return (await res.json()) as T
}

export async function getText(url: string, init?: RequestInit, timeoutMs?: number): Promise<string> {
  const res = await fetchWithTimeout(url, init, timeoutMs)
  if (!res.ok) {
    await res.body?.cancel()
    throw new UpstreamHttpError(res.status, url)
  }
  return res.text()
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m: string, name: string) => ENTITIES[name.toLowerCase()] ?? m)
}

function safeCodePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 依序尝试多个抓取方案,首个成功即返回;全部失败时抛出汇总错误。
 * 用于同平台的多端点故障转移。
 */
export async function firstOk<T>(attempts: Array<{ name: string; run: () => Promise<T> }>): Promise<T> {
  const errors: string[] = []
  for (const attempt of attempts) {
    try {
      return await attempt.run()
    } catch (err) {
      if (err instanceof UpstreamHttpError && [401, 403, 406, 412, 418, 429, 432, 451].includes(err.status)) throw err
      errors.push(`${attempt.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(errors.join(' | ') || 'all attempts failed')
}

/** 从 startIdx 起提取一段括号平衡的 JSON(对 JSON 后的杂项内容免疫) */
export function extractBalancedJson(src: string, startIdx: number): string | null {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') {
      inStr = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(startIdx, i + 1)
    }
  }
  return null
}
