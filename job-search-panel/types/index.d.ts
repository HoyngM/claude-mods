declare module 'claude-code' {
  interface PluginState {
    'job-search-panel': { tick: number; run: Run | null }
  }
}

export type Job = {
  title: string
  company: string
  fit: string
  status: string
  deadline: string | null
  url: string
}

export type Run = {
  kind: 'scrape' | 'rank' | 'refresh'
  title: string
  current: string
  total0: number
  total: number
  added: number
  waiting: number
  searches: number
  details: number
  agents: number
  last: number
}
