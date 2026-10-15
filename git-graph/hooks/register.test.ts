import { expect, test } from 'claude-code/testing'

import { commitDir } from './register'

test('a plain commit uses the session folder', () => {
  expect(commitDir('git commit -m "x"')).toBe(undefined)
  expect(commitDir('git add . && git commit -m x')).toBe(undefined)
})

test('anything that is no commit has no folder', () => {
  expect(commitDir('ls')).toBe(undefined)
  expect(commitDir('cd /a/b && git status')).toBe(undefined)
})

test('cd before the commit sets the folder', () => {
  expect(commitDir('cd /a/b && git commit -m x')).toBe('/a/b')
  expect(commitDir('cd "/a b" && git add . && git commit -m x')).toBe('/a b')
  expect(commitDir('cd /one; cd /two && git commit -m x')).toBe('/two')
})

test('git -C sets the folder, also with other global options', () => {
  expect(commitDir('git -C /a/b commit -m x')).toBe('/a/b')
  expect(commitDir('git -c user.name=x -C ~/repo commit -m x')).toBe('~/repo')
  expect(commitDir('git --no-pager commit -m x')).toBe(undefined)
})

test('git -C after cd is relative to it', () => {
  expect(commitDir('cd "/a b" && git -C sub commit -m x')).toBe('/a b/sub')
  expect(commitDir('cd /a && git -C /abs commit -m x')).toBe('/abs')
})

test('-C that belongs to commit itself is not a folder', () => {
  expect(commitDir('git commit -C HEAD')).toBe(undefined)
})
