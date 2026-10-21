import { expect, test } from 'claude-code/testing'

import { countNotes, insertNote, isThesisDir, labelOf, removeNotes, skeleton } from './tracker'

test('a note lands under its section marker', () => {
  const done = insertNote(skeleton(), 'limits.future', '2026-10-21', 'Test on the real machine.')
  if ('error' in done) throw new Error(done.error)
  expect(countNotes(done.doc)['limits.future']).toBe(1)
  expect(countNotes(done.doc)['limits.scope']).toBe(0)
  expect(done.doc.includes('- **2026-10-21** Test on the real machine.')).toBe(true)
})

test('a second note goes after the first, in the same section', () => {
  const one = insertNote(skeleton(), 'intro.rq', '2026-10-21', 'First.')
  if ('error' in one) throw new Error(one.error)
  const two = insertNote(one.doc, 'intro.rq', '2026-10-22', 'Second.')
  if ('error' in two) throw new Error(two.error)
  const lines = two.doc.split('\n')
  const first = lines.findIndex(l => l.includes('First.'))
  expect(lines[first + 1].includes('Second.')).toBe(true)
  expect(countNotes(two.doc)['intro.rq']).toBe(2)
})

test('the same note twice is refused, an unknown section too', () => {
  const one = insertNote(skeleton(), 'misc', '2026-10-21', 'Same.')
  if ('error' in one) throw new Error(one.error)
  expect('error' in insertNote(one.doc, 'misc', '2026-10-22', 'Same.')).toBe(true)
  expect('error' in insertNote(skeleton(), 'nope', '2026-10-21', 'x')).toBe(true)
})

test('only thesis folders count', () => {
  expect(isThesisDir('/home/me/School/Thesis')).toBe(true)
  expect(isThesisDir('/home/me/Developer/Hobby')).toBe(false)
})

test('labels name the chapter and the section', () => {
  expect(labelOf('limits.future')).toBe('6. Limitations & Future Work > Future work')
  expect(labelOf('concl')).toBe('7. Conclusion')
})

test('removeNotes drops matching notes only', () => {
  const a = insertNote(skeleton(), 'misc', '2026-10-21', 'Keep this one.')
  if ('error' in a) throw new Error(a.error)
  const b = insertNote(a.doc, 'misc', '2026-10-21', 'Drop this old one.')
  if ('error' in b) throw new Error(b.error)
  const r = removeNotes(b.doc, 'misc', 'old one')
  if ('error' in r) throw new Error(r.error)
  expect(countNotes(r.doc).misc).toBe(1)
  expect(r.doc.includes('Keep this one.')).toBe(true)
  expect('error' in removeNotes(r.doc, 'intro.rq', 'Keep this')).toBe(true)
})
