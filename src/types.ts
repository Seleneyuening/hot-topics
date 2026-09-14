export interface HotItem {
  title: string
  /** 热度,平台原始口径(数值或 "947.5w"/"10.0万"),跨平台不可直接比较 */
  hot: string | number
  url: string
  extra?: Record<string, unknown>
}

export interface PlatformResult {
  platform: string
  name: string
  category: string
  /** 数据抓取时间(ISO 8601) */
  update_time: string
  total: number
  items: HotItem[]
  /** 本次数据来自过期缓存(源站抓取失败时的降级) */
  stale?: boolean
  error?: string
}

export interface Env {
  CORS_ORIGIN?: string
  CACHE_TTL?: string
  /** API Key 鉴权:逗号分隔的合法 key 列表;留空则不启用鉴权 */
  API_KEYS?: string
  /** 可选 KV 绑定(Workers/Pages 均可在配置或 Dashboard 中开启),用于跨实例共享缓存 */
  KV?: KVNamespace
  /** Pages 高级模式自带的环境绑定,用于回退到静态资源 */
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
}
