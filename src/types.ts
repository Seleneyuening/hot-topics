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
  source: string
  source_link?: string
  interval_minutes: number | null
  update_time: string
  attempted_at: string | null
  expires_at: string | null
  retry_at: string | null
  status: 'fresh' | 'stale' | 'error' | 'pending'
  total: number
  items: HotItem[]
  stale: boolean
  error?: string
}

export interface Env {
  KV: KVNamespace
}
