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

// A path argument: double quoted, single quoted or bare.
const ARG = String.raw`"[^"]*"|'[^']*'|[^\s;&|]+`

// `git commit`, also with global options before it: `git -C <dir> commit`,
// `git -c user.name=x commit`, `git --no-pager commit`.
const COMMIT = new RegExp(String.raw`\bgit\s+(?:(?:-[Cc]|--git-dir|--work-tree)\s+(?:${ARG})\s+|-\S+\s+)*commit\b`)
const GIT_C = new RegExp(String.raw`(?:^|\s)-C\s+(${ARG})`)
const CD = new RegExp(String.raw`\bcd\s+(${ARG})\s*(?:&&|;)`, 'g')
const MIN_RUNNING_MS = 800
const VISIBLE_MS = 10_000

// Yellow while a git command runs, green once it is done, red if it failed.
const BORDER = { running: 'yellow', ok: 'green', failed: 'red' } as const
const LABEL_WIDTH = 16
const NARROW_COLUMNS = 70

const unquote = (arg: string) => arg.replace(/^(["'])(.*)\1$/, '$2')

// The directory a commit command runs in when the command says so itself:
// the last `cd <dir> &&` before it, then its own `git -C <dir>`. Otherwise
// undefined, and the session's working directory stands.
export const commitDir = (command: string): string | undefined => {
  const hit = COMMIT.exec(command)
  if (hit === null) {
    return undefined
  }
  let dir: string | undefined
  for (const cd of command.slice(0, hit.index).matchAll(CD)) {
    dir = unquote(cd[1])
  }
  const dashC = GIT_C.exec(hit[0])
  if (dashC !== null) {
    const sub = unquote(dashC[1])
    dir = sub.startsWith('/') || sub.startsWith('~') || dir === undefined ? sub : `${dir}/${sub}`
  }
  return dir
}

const parseRecent = (stdout: string): Recent[] =>
  stdout
    .split('\n')
    .filter(line => line.includes('\x1f'))
    .map(line => {
      const [title, when] = line.split('\x1f')
      return { title, when }
    })

async function refresh($: EngineInterface, dir?: string) {
  const git = (...args: string[]) => $.process.run(['git', ...args], dir === undefined ? undefined : { cwd: dir })

  const latest = await git('log', '-n4', '--format=%s%x1f%cr')
  if (latest.exitCode === 0) {
    await update($, recent, () => parseRecent(latest.stdout))
  }

  const top = await git('rev-parse', '--show-toplevel')
  await update($, repo, () => top.stdout.trim().split('/').pop() ?? '')

  const main = await git('log', '-n1', '--format=%s', 'main')
  await update($, mainTitle, () => (main.exitCode === 0 ? main.stdout.trim() : ''))

  const name = await git('branch', '--show-current')
  await update($, branch, () => name.stdout.trim())

  // "<behind>\t<ahead>"; a branch without an upstream counts as 0 and 0.
  const count = await git('rev-list', '--left-right', '--count', '@{upstream}...HEAD')
  const [b, a] = count.exitCode === 0 ? count.stdout.trim().split(/\s+/).map(Number) : [0, 0]
  await update($, behind, () => b)
  await update($, ahead, () => a)
}

// A `~` or a missing folder cannot be handed to the child as it stands: expand
// the home folder, and fall back to the session's folder when it is no repo.
async function resolveDir($: EngineInterface, dir: string | undefined) {
  if (dir === undefined) {
    return undefined
  }
  let full = dir
  if (dir === '~' || dir.startsWith('~/')) {
    const home = await $.process.run(['sh', '-c', 'printf %s "$HOME"'])
    full = home.stdout + dir.slice(1)
  }
  const probe = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: full }).catch(() => undefined)
  return probe !== undefined && probe.exitCode === 0 ? full : undefined
}

export const register: Register = on => {
  // The pane only exists for a moment after Claude makes a commit.
  let closeTimer: { cancel: () => void } | undefined

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!COMMIT.test(e.command)) {
      return next(e)
    }

    closeTimer?.cancel()
    const startedAt = await $.clock.now()
    const dir = await resolveDir($, commitDir(e.command))
    await refresh($, dir)
    await update($, phase, () => 'running')
    void $.ui.open({ id: PANE, title: 'Git graph' })

    const ran = await next(e)
    // A commit that created its folder (`git init`) has a repo only now.
    await refresh($, (await resolveDir($, commitDir(e.command))) ?? dir)

    // Hold the yellow long enough to be seen before it turns green.
    const elapsed = (await $.clock.now()) - startedAt
    if (elapsed < MIN_RUNNING_MS) {
      await $.clock.sleep(MIN_RUNNING_MS - elapsed)
    }

    const hasFailed = ran.deny === undefined && ran.isError === true
    await update($, phase, () => (hasFailed ? 'failed' : 'ok'))

    closeTimer = $.clock.after(VISIBLE_MS, () => {
      void $.ui.close({ id: PANE })
    })

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
