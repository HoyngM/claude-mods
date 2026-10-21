export type Added = { section: string; note: string; kind: 'added' | 'removed' }

declare module 'claude-code' {
  interface PluginState {
    'thesis-progress-tracker': {
      added: Added[]
      notes: number
      sections: number
      git: string
      phase: string
    }
  }
}
