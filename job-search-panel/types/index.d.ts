declare module 'claude-code' {
  interface PluginState {
    'job-search-panel': { tick: number }
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
