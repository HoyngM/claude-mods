export type Recent = { title: string; when: string }

declare module 'claude-code' {
  interface PluginState {
    'git-graph': {
      recent: Recent[]
      repo: string
      mainTitle: string
      ahead: number
      behind: number
      branch: string
      phase: string
    }
  }
}
