import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Recent } from '../types'

const PANE = 'git-graph'
const recent = atom({ plugin: 'git-graph', key: 'recent' } as const, [])
const repo = atom({ plugin: 'git-graph', key: 'repo' } as const, '')
const mainTitle = atom({ plugin: 'git-graph', key: 'mainTitle' } as const, '')
const ahead = atom({ plugin: 'git-graph', key: 'ahead' } as const, 0)
const behind = atom({ plugin: 'git-graph', key: 'behind' } as const, 0)
const branch = atom({ plugin: 'git-graph', key: 'branch' } as const, '')

const phase = atom({ plugin: 'git-graph', key: 'phase' } as const, 'ok')

const GIT = /^\s*(rtk\s+)?git\s+/
const MIN_RUNNING_MS = 800

// Yellow while a git command runs, green once it is done, red if it failed.
const BORDER = { running: 'yellow', ok: 'green', failed: 'red' } as const
const LABEL_WIDTH = 16
const NARROW_COLUMNS = 70

const parseRecent = (stdout: string): Recent[] =>
  stdout
    .split('\n')
    .filter(line => line.includes('\x1f'))
    .map(line => {
      const [title, when] = line.split('\x1f')
      return { title, when }
    })

async function refresh($: EngineInterface) {
  const latest = await $.process.run(['git', 'log', '-n4', '--format=%s%x1f%cr'])
  if (latest.exitCode === 0) {
    await update($, recent, () => parseRecent(latest.stdout))
  }

  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
  await update($, repo, () => top.stdout.trim().split('/').pop() ?? '')

  const main = await $.process.run(['git', 'log', '-n1', '--format=%s', 'main'])
  await update($, mainTitle, () => (main.exitCode === 0 ? main.stdout.trim() : ''))

  const name = await $.process.run(['git', 'branch', '--show-current'])
  await update($, branch, () => name.stdout.trim())

  // "<behind>\t<ahead>"; a branch without an upstream counts as 0 and 0.
  const count = await $.process.run([
    'git',
    'rev-list',
    '--left-right',
    '--count',
    '@{upstream}...HEAD',
  ])
  const [b, a] = count.exitCode === 0 ? count.stdout.trim().split(/\s+/).map(Number) : [0, 0]
  await update($, behind, () => b)
  await update($, ahead, () => a)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($)
    void $.ui.open({ id: PANE, title: 'Git graph' })

    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!GIT.test(e.command)) {
      return next(e)
    }

    const startedAt = await $.clock.now()
    await update($, phase, () => 'running')

    const ran = await next(e)
    await refresh($)

    // Hold the yellow long enough to be seen before it turns green.
    const elapsed = (await $.clock.now()) - startedAt
    if (elapsed < MIN_RUNNING_MS) {
      await $.clock.sleep(MIN_RUNNING_MS - elapsed)
    }

    const hasFailed = ran.deny === undefined && ran.isError === true
    await update($, phase, () => (hasFailed ? 'failed' : 'ok'))

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const latest = await read($, recent)
    const up = await read($, ahead)
    const down = await read($, behind)
    const name = await read($, branch)
    const title = await read($, repo)
    const onMain = await read($, mainTitle)
    const borderColor = BORDER[(await read($, phase)) as keyof typeof BORDER]

    // A docked side pane is narrow: stack each label above its value.
    if ((e.viewport?.columns ?? 80) < NARROW_COLUMNS) {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
          <Text bold color={borderColor}>{title.toUpperCase()}</Text>
          <Text bold>You're on:</Text>
          <Box paddingLeft={2}>
            <Text>
              <Text bold color="green">{name === '' ? 'detached HEAD' : name}</Text>
              <Text color="magenta"> ↑{up}</Text>
              <Text color="blue"> ↓{down}</Text>
            </Text>
          </Box>
          <Text bold>Main is on:</Text>
          <Box paddingLeft={2}>
            <Text color="cyan">{onMain === '' ? 'unknown' : onMain}</Text>
          </Box>
          <Box marginTop={1}>
            <Text bold>Latest updates:</Text>
          </Box>
          {latest.map((one, i) => (
            <Box key={String(i)}>
              <Text>
                <Text dimColor>{i + 1}. </Text>
                {one.title}
                <Text dimColor> ({one.when})</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
        <Text bold color={borderColor}>{title.toUpperCase()}</Text>
        <Box alignItems="flex-start" justifyContent="flex-start">
          <Box width={LABEL_WIDTH}>
            <Text bold>You're on:</Text>
          </Box>
          <Text>
            <Text bold color="green">{name === '' ? 'detached HEAD' : name}</Text>
            <Text color="magenta"> ↑{up}</Text>
            <Text color="blue"> ↓{down}</Text>
          </Text>
        </Box>
        <Box alignItems="flex-start" justifyContent="flex-start">
          <Box width={LABEL_WIDTH}>
            <Text bold>Main is on:</Text>
          </Box>
          <Box flexGrow={1} alignItems="flex-start" justifyContent="flex-start">
            <Text color="cyan">{onMain === '' ? 'unknown' : onMain}</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
            <Text bold>Latest updates:</Text>
          </Box>
        {latest.map((one, i) => (
          <Box key={String(i)}>
            <Text>
              <Text dimColor>{i + 1}. </Text>
              {one.title}
              <Text dimColor> ({one.when})</Text>
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
