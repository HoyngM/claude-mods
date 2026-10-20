import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Job, Run } from '../types'

const PANE = 'job-search'
const STATUS = 'job-search-status'
const SEEN = 'job_scraper/seen_jobs.json'
const tick = atom({ plugin: 'job-search-panel', key: 'tick' } as const, 0)
const run = atom({ plugin: 'job-search-panel', key: 'run' } as const, null as Run | null)
const rank: Record<string, number> = { high: 0, medium: 1 }
const TITLES = { scrape: 'Scraping jobs', rank: 'Ranking postings', refresh: 'Refreshing dashboard' }

const seenOf = async ($: any): Promise<Record<string, any> | undefined> => {
  const path = `${await $.session.root()}/${SEEN}`
  if (!(await $.fs.exists(path))) return undefined

  return JSON.parse(await $.fs.read(path)).seen ?? {}
}

const counts = (seen: Record<string, any>) => {
  const all = Object.values(seen) as any[]

  return {
    total: all.length,
    waiting: all.filter(j => j.status === 'new' || j.status === 'unreachable').length,
  }
}

const jobs = async ($: any): Promise<Job[] | undefined> => {
  const seen = await seenOf($)
  if (!seen) return undefined

  return (Object.values(seen) as Job[])
    .filter(j => j.fit in rank && j.status !== 'expired' && j.status !== 'unreachable')
    .sort((a, b) => rank[a.fit] - rank[b.fit] || (a.deadline ?? '9').localeCompare(b.deadline ?? '9'))
}

const detailOf = (r: Run) => {
  if (r.kind === 'scrape') return `${r.searches} searches run, ${r.added} new postings stored`
  if (r.kind === 'rank') {
    return `${r.waiting} postings waiting, up to 10 per run${r.agents ? `, ${r.agents} scoring agents started` : ''}`
  }

  return `${r.total} postings go to the dashboard`
}

const begin = async ($: any, kind: Run['kind']) => {
  const seen = await seenOf($)
  if (!seen) return
  const { total, waiting } = counts(seen)
  const now = await $.clock.now()
  await update($, run, () => ({
    kind, title: TITLES[kind], current: 'Starting', total0: total, total, added: 0, waiting,
    searches: 0, details: 0, agents: 0, last: now,
  }))
  void $.ui.open({ id: STATUS, title: 'Job search', rows: 6 })
}

const finish = async ($: any) => {
  await update($, run, () => null)
  await $.ui.close({ id: STATUS })
}

// What the tool call says about progress, as a patch of the run.
const progress = async ($: any, e: any, r: Run): Promise<Partial<Run>> => {
  const cmd: string = e.command ?? ''
  if (e.tool === 'Bash') {
    const q = cmd.match(/-q\s+["']([^"']+)["']/)?.[1]
    if (/linkedin-search[^\n]*\bsearch\b/.test(cmd)) {
      return { searches: r.searches + 1, current: `LinkedIn: ${q ?? 'searching'}` }
    }
    if (/freehire-search[^\n]*\bsearch\b/.test(cmd)) {
      return { searches: r.searches + 1, current: `Freehire: ${q ?? 'searching'}` }
    }
    const portal = cmd.match(/(jobindex|jobbank|jobdanmark|jobnet)-search/)?.[1]
    if (portal) return { searches: r.searches + 1, current: `${portal}: searching` }
    if (/cli\.ts\s+detail\b/.test(cmd)) return { details: r.details + 1, current: 'Reading posting details' }
    if (/rank_state\.py\s+candidates/.test(cmd)) return { current: 'Picking postings to rank' }
    if (/rank_state\.py\s+apply/.test(cmd)) return { current: 'Saving scores' }
    if (/rank_state\.py\s+sweep/.test(cmd)) return { current: 'Checking deadlines' }
    if (/export_dashboard/.test(cmd)) return { current: 'Exporting rows for the dashboard' }
    if (/seen_jobs|rank_state|store/.test(cmd)) {
      const seen = await seenOf($)
      const c = seen ? counts(seen) : { total: r.total, waiting: r.waiting }

      return { ...c, added: Math.max(0, c.total - r.total0), current: 'Storing postings' }
    }

    return {}
  }
  if (e.tool === 'Agent' || e.tool === 'Task') {
    if (/scorer/.test(e.subagent_type ?? '')) {
      return { agents: r.agents + 1, current: `Scoring postings, agent ${r.agents + 1}` }
    }

    return {}
  }
  if (e.tool === 'WebSearch' || e.tool === 'WebFetch') return { current: 'Checking a posting online' }
  if (e.tool === 'Artifact') {
    if (e.action === 'open') return { current: 'Opening the dashboard' }
    if (e.asset) return { current: 'Uploading rows to the dashboard' }

    return {}
  }
  if (e.tool === 'ArtifactData') return { current: 'Updating the dashboard data' }

  return {}
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'jobs', description: 'Show the top job matches in a pane' })
    await $.command.register({
      name: 'refresh',
      description: 'Refresh the Job search dashboard artifact and open it',
    })

    return next(e)
  })

  on('command.run', { command: 'jobs' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Job search' })

    return { text: 'Job search pane opened.' }
  })

  for (const name of ['scrape', 'job-scraper']) {
    on('command.run', { command: name }, async ($, e, next) => {
      await begin($, 'scrape')

      return next(e)
    })
  }

  on('command.run', { command: 'rank' }, async ($, e, next) => {
    await begin($, 'rank')

    return next(e)
  })

  on('command.run', { command: 'refresh' }, async $ => {
    if (!(await seenOf($))) {
      return { text: 'No job_scraper/seen_jobs.json here. Open this in the ai-job-search folder.' }
    }
    await begin($, 'refresh')
    void $.prompt.submit({
      text:
        'Refresh the Job search dashboard artifact now. Follow the steps under "Dashboard sync after /scrape and /rank" in CLAUDE.md, in order, without running /scrape or /rank first. Finish with one line saying how many rows the dashboard holds.',
    })

    return { text: 'Refreshing the dashboard.' }
  })

  on('tool.call', async ($, e, next) => {
    const r = await read($, run)
    if (!r) return next(e)
    const now = await $.clock.now()
    const patch = await progress($, e, r)
    const next_ = { ...r, ...patch, last: now }
    await update($, run, () => next_)
    const ran = await next(e)
    const open = (e as any).tool === 'Artifact' && (e as any).action === 'open'
    if (open) {
      await $.clock.sleep(1500)
      await finish($)
    }

    return ran
  })

  // Safety net: a run that stopped without opening the dashboard clears itself.
  on('turn.complete', async ($, e, next) => {
    if (!(e as any).agentId) {
      $.clock.after(60000, async () => {
        const r = await read($, run)
        if (r && (await $.clock.now()) - r.last > 50000) await finish($)
      })
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: STATUS }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, run)
    if (!r) return <Text dimColor>Idle</Text>

    return (
      <Box flexDirection="column">
        <Text bold>{r.title}</Text>
        <Text dimColor>{detailOf(r)}</Text>
        <Text>{r.current}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const list = await jobs($)
    if (!list) return <Text dimColor>No job_scraper/seen_jobs.json here. Open this in the ai-job-search folder.</Text>
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 6)

    const send = async (names: string[]) => {
      void $.ui.close({ id: PANE })
      for (const command of names) {
        try {
          await $.command.run({ command })
          return
        } catch (err) {
          if (command === names[names.length - 1]) void $.ui.toast(`/${command} failed: ${String(err)}`)
        }
      }
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Button key="scrape" variant="primary" hotkey="s" onPress={() => void send(['scrape', 'job-scraper'])}>Scrape</Button>
          <Button key="rank" hotkey="r" onPress={() => void send(['rank'])}>Rank</Button>
          <Button key="refresh" hotkey="d" onPress={() => void send(['refresh'])}>Dashboard</Button>
          <Button key="reload" hotkey="f" onPress={() => void update($, tick, n => n + 1)}>Reload list</Button>
        </Box>
        <Text dimColor>High and medium matches, closest deadline first</Text>
        {list.slice(0, room).map(j => (
          <Text key={j.url}>
            {j.fit === 'high' ? 'HIGH' : 'med '} {j.company}: {j.title}
            {j.deadline ? ` (until ${j.deadline})` : ''}
          </Text>
        ))}
      </Box>
    )
  })
}
