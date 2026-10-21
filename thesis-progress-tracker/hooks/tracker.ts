// The thesis structure (copy of Template/JADS_Thesis_structure.docx) and the
// text edits the tracker file takes. Pure functions, no engine calls.

export type Leaf = { id: string; title: string; hint?: string }
export type Chapter = { title: string; leaves: Leaf[] }

// A chapter with one leaf whose title equals the chapter's has no ### heading.
export const CHAPTERS: Chapter[] = [
  {
    title: '1. Introduction',
    leaves: [
      { id: 'intro.motivation', title: 'Motivation and background', hint: 'Domain, motivation, current state, the gap, surveys/stats.' },
      { id: 'intro.problem', title: 'Problem definition' },
      { id: 'intro.rq', title: 'Research questions' },
      { id: 'intro.organization', title: 'Organization of thesis' },
    ],
  },
  {
    title: '2. Literature review',
    leaves: [
      { id: 'lit.related', title: 'Related work', hint: 'Motivate the RQs with related work; systematic search (PRISMA).' },
      { id: 'lit.gaps', title: 'Research gaps' },
    ],
  },
  {
    title: '3. Methodology',
    leaves: [
      { id: 'method.approach', title: 'Approach and motivation', hint: 'Why this method, backed by Q1 / A-ranked work.' },
      { id: 'method.dataset', title: 'Examined data and dataset' },
      { id: 'method.collection', title: 'Data collection' },
      { id: 'method.preparation', title: 'Data preparation' },
      { id: 'method.system', title: 'System design', hint: 'Incl. high-level architecture and workflow diagram.' },
      { id: 'method.pipeline', title: 'Data pipeline design' },
    ],
  },
  {
    title: '4. System implementation & Experiment results',
    leaves: [
      { id: 'impl.metrics', title: 'Evaluation metrics' },
      { id: 'impl.performance', title: 'Model performance (test/validation)' },
      { id: 'impl.comparison', title: 'Model comparison' },
      { id: 'impl.other', title: 'Other implementation notes' },
    ],
  },
  {
    title: '5. Discussion & Challenges',
    leaves: [
      { id: 'disc.results', title: 'Discussion of results' },
      { id: 'disc.rq', title: 'Answers to the research questions' },
      { id: 'disc.contributions', title: 'Contributions and lessons learned', hint: 'How it goes beyond the state of the art.' },
      { id: 'disc.impact', title: 'Implications and impact' },
      { id: 'disc.challenges', title: 'Challenges met' },
    ],
  },
  {
    title: '6. Limitations & Future Work',
    leaves: [
      { id: 'limits.limitations', title: 'Limitations' },
      { id: 'limits.scope', title: 'Out of scope', hint: 'Things deliberately left out of the thesis.' },
      { id: 'limits.future', title: 'Future work' },
    ],
  },
  { title: '7. Conclusion', leaves: [{ id: 'concl', title: '7. Conclusion' }] },
  { title: 'Appendix', leaves: [{ id: 'appx', title: 'Appendix' }] },
  { title: 'Parked', leaves: [{ id: 'misc', title: 'Parked', hint: 'Fits no section yet; move it when the structure settles.' }] },
]

export const LEAVES: Leaf[] = CHAPTERS.flatMap(c => c.leaves)
export const IDS: string[] = LEAVES.map(l => l.id)

export const labelOf = (id: string): string => {
  for (const c of CHAPTERS) {
    const leaf = c.leaves.find(l => l.id === id)
    if (leaf !== undefined) {
      return leaf.title === c.title ? c.title : `${c.title} > ${leaf.title}`
    }
  }
  return id
}

const marker = (id: string) => `<!-- sec:${id} -->`

export const skeleton = (): string => {
  const out = [
    '# Thesis progress tracker',
    '',
    '> Working copy of the JADS thesis structure (`Template/JADS_Thesis_structure.docx`).',
    '> Claude adds short dated notes here while we work: decisions, scope, limitations, future work,',
    '> literature findings, results. Format: `**date** what, and why`. The `<!-- sec:... -->` lines are',
    '> anchors for the thesis-progress-tracker mod; leave them in place.',
    '',
  ]
  for (const c of CHAPTERS) {
    out.push(`## ${c.title}`, '')
    for (const l of c.leaves) {
      if (l.title !== c.title) {
        out.push(`### ${l.title}`)
      }
      if (l.hint !== undefined) {
        out.push(`_${l.hint}_`)
      }
      out.push(marker(l.id), '')
    }
  }
  return out.join('\n')
}

export type Inserted = { doc: string } | { error: 'unknown-section' | 'duplicate' }

const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

// Adds `- **<date>** <note>` after the last bullet of the section's block.
export const insertNote = (doc: string, id: string, date: string, note: string): Inserted => {
  const lines = doc.split('\n')
  const at = lines.indexOf(marker(id))
  if (at === -1) {
    return { error: 'unknown-section' }
  }
  const text = flat(note)
  const bullet = `- **${date}** ${text}`
  let last = at
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('#') || line.startsWith('<!-- sec:')) {
      break
    }
    if (line.startsWith('- ')) {
      if (line.replace(/^- \*\*[^*]+\*\* /, '') === text) {
        return { error: 'duplicate' }
      }
      last = i
    } else if (line.startsWith('  ') && line.trim() !== '') {
      last = i
    }
  }
  lines.splice(last + 1, 0, bullet)
  return { doc: lines.join('\n') }
}

export type Removed = { doc: string; removed: string[] } | { error: 'unknown-section' | 'no-match' }

// Drops every bullet of the section whose text contains `contains` (case-insensitive).
export const removeNotes = (doc: string, id: string, contains: string): Removed => {
  const lines = doc.split('\n')
  const at = lines.indexOf(marker(id))
  if (at === -1) {
    return { error: 'unknown-section' }
  }
  const needle = flat(contains).toLowerCase()
  const removed: string[] = []
  const keep = lines.filter((line, i) => {
    if (i <= at || !line.startsWith('- ')) {
      return true
    }
    for (let j = at + 1; j < i; j++) {
      if (lines[j].startsWith('#') || lines[j].startsWith('<!-- sec:')) {
        return true
      }
    }
    if (line.toLowerCase().includes(needle)) {
      removed.push(line.replace(/^- \*\*[^*]+\*\* /, ''))
      return false
    }
    return true
  })
  return removed.length === 0 ? { error: 'no-match' } : { doc: keep.join('\n'), removed }
}

// Notes per leaf, in file order.
export const countNotes = (doc: string): Record<string, number> => {
  const counts: Record<string, number> = {}
  let current: string | undefined
  for (const line of doc.split('\n')) {
    const hit = /^<!-- sec:(\S+) -->$/.exec(line)
    if (hit !== null) {
      current = hit[1]
      counts[current] = 0
    } else if (line.startsWith('#')) {
      current = undefined
    } else if (current !== undefined && line.startsWith('- ')) {
      counts[current]++
    }
  }
  return counts
}

// Sessions in the thesis project: the working folder's path says so.
export const isThesisDir = (cwd: string): boolean => /thesis/i.test(cwd)

export const sectionList = (): string =>
  CHAPTERS.map(c => c.leaves.map(l => `${l.id} (${l.title === c.title ? c.title : `${c.title.replace(/^\d+\. /, '')}: ${l.title}`})`).join(', ')).join('; ')
