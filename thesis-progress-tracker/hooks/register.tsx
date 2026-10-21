import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Added } from '../types'
import { IDS, countNotes, insertNote, isThesisDir, labelOf, removeNotes, sectionList, skeleton } from './tracker'

const NAME = 'thesis-progress-tracker'
const TOOL = 'thesis_note'
const FULL_TOOL = `mcp__${NAME}__${TOOL}`
const REMOVE = 'thesis_remove'
const REMOVE_TOOL = `mcp__${NAME}__${REMOVE}`
const PANE = 'thesis-tracker'

// The tracker lives in the clone of the private HoyngM/Thesis repo, outside OneDrive.
const REPO = 'Developer/Thesis'
const FILE = 'THESIS_PROGRESS_TRACKER.md'

const MIN_RUNNING_MS = 800
const VISIBLE_MS = 10_000
const NOTE_WIDTH = 120
const SHOWN = 5

const added = atom({ plugin: 'thesis-progress-tracker', key: 'added' } as const, [] as Added[])
const notes = atom({ plugin: 'thesis-progress-tracker', key: 'notes' } as const, 0)
const sections = atom({ plugin: 'thesis-progress-tracker', key: 'sections' } as const, 0)
const git = atom({ plugin: 'thesis-progress-tracker', key: 'git' } as const, '')
const phase = atom({ plugin: 'thesis-progress-tracker', key: 'phase' } as const, 'saving')

// Yellow while saving, green once pushed, red if git failed (the note is saved either way).
const BORDER = { saving: 'yellow', ok: 'green', failed: 'red' } as const

const RULES = `Thesis progress tracker is active in this session. The tool ${FULL_TOOL} files a short note in Max's thesis tracker: a copy of the JADS thesis structure, kept in git. Call it yourself, without asking, whenever the conversation yields something Max should be able to recall months later for one specific thesis section: a scope decision (what is out of scope: limits.scope; what is left for future work, such as testing the model on the real machine: limits.future), a limitation, a method choice and the reason for it, a data fact, a metric, a result, a challenge, a change to a research question, a key source or literature finding, or feedback from the supervisor. Write one or two plain sentences: what, and why, with names, numbers and who decided. One call per point. Skip trivia, repeats and talk about tooling. Do not announce each call; one short line at most. If a point fits no section, use misc. Max allows you to remove notes that are outdated, applied or superseded: call ${REMOVE_TOOL} (section plus a distinctive piece of the note's text), and add the replacement with the note tool. Prefer replacing over piling up contradicting notes. Sections: ${sectionList()}.`

const flat = (text: string) => text.replace(/\s+/g, ' ').trim()
const trim = (text: string) => (text.length > NOTE_WIDTH ? `${text.slice(0, NOTE_WIDTH - 1)}…` : text)

// Module state: the pane's timer, and the one-after-the-other queue for parallel tool calls.
const ui: { closeTimer?: { cancel: () => void }; isOpen: boolean; queue: Promise<unknown>; home?: string } = {
  isOpen: false,
  queue: Promise.resolve(),
}

async function homeOf($: EngineInterface) {
  ui.home ??= (await $.process.run(['sh', '-c', 'printf %s "$HOME"'])).stdout
  return ui.home
}

// Commit only the tracker file, then push; one pull --rebase if the push is refused.
async function sync($: EngineInterface, repo: string, message: string): Promise<{ isOk: boolean; text: string }> {
  const run = (...args: string[]) => $.process.run(['git', ...args], { cwd: repo, timeoutMs: 60_000 })
  const staged = await run('add', '--', FILE)
  if (staged.exitCode !== 0) {
    return { isOk: false, text: `git add failed: ${staged.stderr.trim().split('\n')[0]}` }
  }
  const commit = await run('commit', '-m', message, '--', FILE)
  if (commit.exitCode !== 0) {
    return { isOk: false, text: `git commit failed: ${(commit.stderr || commit.stdout).trim().split('\n')[0]}` }
  }
  let push = await run('push')
  if (push.exitCode !== 0) {
    await run('pull', '--rebase', '--autostash')
    push = await run('push')
  }
  if (push.exitCode !== 0) {
    return { isOk: false, text: `committed, push failed: ${push.stderr.trim().split('\n').pop()}` }
  }
  return { isOk: true, text: 'pushed' }
}

async function save($: EngineInterface, section: string, note: string, mode: 'add' | 'remove'): Promise<string> {
  const repo = `${await homeOf($)}/${REPO}`
  if (!(await $.fs.exists(`${repo}/.git`))) {
    throw new Error(`No clone of the thesis repo at ~/${REPO}. Run: git clone https://github.com/HoyngM/Thesis.git ~/${REPO}`)
  }
  const path = `${repo}/${FILE}`
  const startedAt = await $.clock.now()
  const date = (await $.process.run(['date', '+%F'])).stdout.trim()
  const before = (await $.fs.exists(path)) ? await $.fs.read(path) : skeleton()

  let doc: string
  let shown: Added[]
  let message: string
  if (mode === 'add') {
    const done = insertNote(before, section, date, note)
    if ('error' in done) {
      if (done.error === 'duplicate') {
        return `Already in the tracker under ${labelOf(section)}; nothing added.`
      }
      throw new Error(`Section "${section}" is not in the tracker file. Known: ${IDS.join(', ')}`)
    }
    doc = done.doc
    shown = [{ section: labelOf(section), note: trim(flat(note)), kind: 'added' }]
    message = `Tracker: ${labelOf(section)}: ${flat(note).slice(0, 60)}`
  } else {
    const done = removeNotes(before, section, note)
    if ('error' in done) {
      throw new Error(done.error === 'no-match' ? `No note under ${labelOf(section)} contains "${note}".` : `Section "${section}" is not in the tracker file.`)
    }
    doc = done.doc
    shown = done.removed.map(text => ({ section: labelOf(section), note: trim(text), kind: 'removed' as const }))
    message = `Tracker: remove ${done.removed.length} from ${labelOf(section)}`
  }

  ui.closeTimer?.cancel()
  if (!ui.isOpen) {
    ui.isOpen = true
    await update($, added, () => [])
  }
  await update($, phase, () => 'saving')
  void $.ui.open({ id: PANE, title: 'Thesis tracker' })

  await $.fs.write(path, doc)
  const counts = countNotes(doc)
  await update($, added, list => [...list, ...shown].slice(-SHOWN))
  await update($, notes, () => Object.values(counts).reduce((a, b) => a + b, 0))
  await update($, sections, () => Object.values(counts).filter(n => n > 0).length)

  const synced = await sync($, repo, message)

  const elapsed = (await $.clock.now()) - startedAt
  if (elapsed < MIN_RUNNING_MS) {
    await $.clock.sleep(MIN_RUNNING_MS - elapsed)
  }
  await update($, git, () => synced.text)
  await update($, phase, () => (synced.isOk ? 'ok' : 'failed'))

  ui.closeTimer = $.clock.after(VISIBLE_MS, () => {
    ui.isOpen = false
    void $.ui.close({ id: PANE })
  })
  return mode === 'add' ? `Saved under ${labelOf(section)}. Git: ${synced.text}.` : `Removed ${shown.length} from ${labelOf(section)}. Git: ${synced.text}.`
}

export const register: Register = on => {
  // The tool exists only in thesis sessions.
  on('session.start', async ($, e, next) => {
    if (isThesisDir(await $.session.cwd())) {
      await $.tool.register({
        name: TOOL,
        description:
          'File a short note in the thesis progress tracker under one section of the thesis structure, then commit and push it. Use it for decisions, scope, limitations, future work, method choices, results and sources worth recalling later.',
        inputSchema: {
          type: 'object',
          properties: {
            section: { type: 'string', enum: IDS, description: 'Id of the thesis section the note belongs to.' },
            note: { type: 'string', description: 'One or two plain sentences: what, and why. Names, numbers, who decided.' },
          },
          required: ['section', 'note'],
        },
        isDeferred: false,
      })
      await $.tool.register({
        name: REMOVE,
        description:
          'Remove outdated, applied or superseded notes from the thesis progress tracker: every note of the section whose text contains the given piece of text. Commits and pushes.',
        inputSchema: {
          type: 'object',
          properties: {
            section: { type: 'string', enum: IDS, description: 'Id of the section the note is in.' },
            contains: { type: 'string', description: 'A distinctive piece of the note text; every note of the section containing it is removed.' },
          },
          required: ['section', 'contains'],
        },
        isDeferred: false,
      })
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    if (!isThesisDir(await $.session.cwd())) {
      return out
    }
    return { sections: [...out.sections, { id: `${NAME}:rules`, text: RULES, scope: 'session' as const }] }
  })

  on('tool.call', { tool: 'mcp__thesis-progress-tracker__thesis_note' }, async ($, e) => {
    const args = e as unknown as { section?: unknown; note?: unknown }
    const section = String(args.section ?? '')
    const note = String(args.note ?? '').trim()
    if (note === '') {
      return { deny: 'The note is empty.' }
    }
    const turn = ui.queue.then(() => save($, section, note, 'add'))
    ui.queue = turn.catch(() => undefined)
    try {
      return { result: await turn }
    } catch (error) {
      await update($, phase, () => 'failed')
      await update($, git, () => (error instanceof Error ? error.message : String(error)))
      return { deny: error instanceof Error ? error.message : String(error) }
    }
}).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__thesis-progress-tracker__thesis_remove' }, async ($, e) => {
    const args = e as unknown as { section?: unknown; contains?: unknown }
    const contains = String(args.contains ?? '').trim()
    if (contains.length < 8) {
      return { deny: 'Give a distinctive piece of the note text (at least 8 characters).' }
    }
    const turn = ui.queue.then(() => save($, String(args.section ?? ''), contains, 'remove'))
    ui.queue = turn.catch(() => undefined)
    try {
      return { result: await turn }
    } catch (error) {
      await update($, phase, () => 'failed')
      await update($, git, () => (error instanceof Error ? error.message : String(error)))
      return { deny: error instanceof Error ? error.message : String(error) }
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, added)
    const total = await read($, notes)
    const used = await read($, sections)
    const where = await read($, git)
    const color = BORDER[(await read($, phase)) as keyof typeof BORDER]

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
        <Text bold color={color}>THESIS PROGRESS TRACKER</Text>
        <Box marginTop={1}>
          <Text bold>Changed in the thesis:</Text>
        </Box>
        {list.map((one, i) => (
          <Box key={String(i)} flexDirection="column" marginBottom={i === list.length - 1 ? 0 : 1}>
            <Text bold color={one.kind === 'removed' ? 'red' : 'cyan'}>{one.kind === 'removed' ? 'Removed from ' : ''}{one.section}</Text>
            <Box paddingLeft={2}>
              <Text strikethrough={one.kind === 'removed'} dimColor={one.kind === 'removed'}>{one.note}</Text>
            </Box>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>
            {total} notes in {used} sections · git: {where === '' ? 'saving…' : where}
          </Text>
        </Box>
      </Box>
    )
  })
}
