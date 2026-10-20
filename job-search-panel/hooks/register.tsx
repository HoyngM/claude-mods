import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Job } from '../types'

const PANE = 'job-search'
const SEEN = 'job_scraper/seen_jobs.json'
const tick = atom({ plugin: 'job-search-panel', key: 'tick' } as const, 0)
const rank: Record<string, number> = { high: 0, medium: 1 }

const jobs = async ($: any): Promise<Job[] | undefined> => {
  const path = `${await $.session.root()}/${SEEN}`
  if (!(await $.fs.exists(path))) return undefined
  const seen = JSON.parse(await $.fs.read(path)).seen ?? {}

  return (Object.values(seen) as Job[])
    .filter(j => j.fit in rank && j.status !== 'expired' && j.status !== 'unreachable')
    .sort((a, b) => rank[a.fit] - rank[b.fit] || (a.deadline ?? '9').localeCompare(b.deadline ?? '9'))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jobs',
      description: 'Open the job search pane with Scrape and Rank buttons',
    })
    if (await jobs($)) void $.ui.open({ id: PANE, title: 'Job search' })

    return next(e)
  })

  on('command.run', { command: 'jobs' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Job search' })

    return { text: 'Job search pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tick)
    const list = await jobs($)
    if (!list) return <Text dimColor>No job_scraper/seen_jobs.json here. Open this in the ai-job-search folder.</Text>
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 6)

    const send = async (names: string[]) => {
      void $.ui.toast(`Starting /${names[0]}`)
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
          <Button key="refresh" hotkey="f" onPress={() => void update($, tick, n => n + 1)}>Refresh</Button>
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
