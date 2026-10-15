import { expect, test } from 'claude-code/testing'

import { commitDir, repoName } from './register'

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

test('the repo name comes from origin, not from the folder', () => {
  expect(repoName('https://github.com/HoyngM/DE.git\n', '/Users/max/Developer/jads-y2-de\n')).toBe('DE')
  expect(repoName('git@github.com:HoyngM/Jaar-1.git', '/x/y')).toBe('Jaar-1')
  expect(repoName('https://github.com/HoyngM/Hobby/', '/x/y')).toBe('Hobby')
})

test('without an origin the folder name stands', () => {
  expect(repoName('', '/Users/max/Developer/Hobby\n')).toBe('Hobby')
})
