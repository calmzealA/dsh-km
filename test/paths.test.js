import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  isInside,
  isNoteId,
  noteFilePath,
  normalizeId,
  resolveVaultRoot,
  slugify,
  trashFilePath,
} from '../lib/paths.js'

test('recognizes only well-formed note ids', () => {
  assert.equal(isNoteId('km-1a2b3c4d'), true)
  assert.equal(normalizeId(' KM-1A2B3C4D '), 'km-1a2b3c4d')
  assert.equal(isNoteId('km-123'), false)
  assert.equal(isNoteId('../km-1a2b3c4d'), false)
  assert.equal(normalizeId('../../etc/passwd'), null)
})

test('keeps CJK titles and removes path-hostile characters', () => {
  assert.equal(slugify('检索方案：BM25 与向量'), '检索方案BM25-与向量')
  assert.equal(slugify('a/b\\c:d*e?f'), 'abcdef')
  assert.equal(slugify('   ...   '), 'note')
  assert.equal(slugify('CON'), 'CON-note')
  assert.ok(Array.from(slugify('长'.repeat(100))).length <= 40)
})

test('resolves a default vault inside the workspace only', () => {
  const workspace = path.resolve('C:/work/demo')
  assert.equal(resolveVaultRoot(workspace, ''), path.join(workspace, '.dsh-km'))
  assert.equal(resolveVaultRoot(workspace, 'notes-vault'), path.join(workspace, 'notes-vault'))
  assert.throws(() => resolveVaultRoot(workspace, '..'), /subdirectory/)
  assert.throws(() => resolveVaultRoot(workspace, path.resolve('C:/work/other')), /subdirectory/)
  assert.throws(() => resolveVaultRoot(workspace, '.'), /subdirectory/)
})

test('checks containment without prefix confusion', () => {
  const parent = path.resolve('C:/work/demo')
  assert.equal(isInside(parent, path.join(parent, '.dsh-km')), true)
  assert.equal(isInside(parent, path.resolve('C:/work/demo-other')), false)
  assert.equal(isInside(parent, parent), false)
})

test('builds note and trash paths with the id suffix', () => {
  const root = path.resolve('C:/work/demo/.dsh-km')
  assert.equal(noteFilePath(root, 'km-1a2b3c4d', '标题'), path.join(root, 'notes', '标题-km-1a2b3c4d.md'))
  const trash = trashFilePath(root, 'km-1a2b3c4d', '标题', new Date('2026-11-11T09:00:00'))
  assert.match(trash, /\.trash[\\/]20261111T090000-标题-km-1a2b3c4d\.md$/)
})
