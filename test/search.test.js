import assert from 'node:assert/strict'
import test from 'node:test'

import { SearchIndex } from '../lib/search.js'

function note(overrides) {
  return {
    id: overrides.id ?? 'km-00000001',
    title: overrides.title ?? '',
    body: overrides.body ?? '',
    tags: overrides.tags ?? [],
    when: overrides.when ?? '',
    status: overrides.status ?? 'verified',
    updated: overrides.updated ?? '2026-11-11T00:00:00.000Z',
    path: overrides.path ?? 'notes/x.md',
    sources: overrides.sources ?? [],
  }
}

function indexWith(notes) {
  const index = new SearchIndex()
  for (const item of notes) index.add(note(item))
  return index
}

test('matches Chinese bigrams and ranks the focused note first', () => {
  const index = indexWith([
    { id: 'km-00000001', title: '检索方案选型', body: '我们在项目里比较了 BM25 与向量检索，最后选择混合检索。', tags: ['检索'] },
    { id: 'km-00000002', title: '部署记录', body: '今天把服务部署到了测试环境。' },
  ])
  const result = index.search('向量检索')
  assert.equal(result.mode, 'bm25')
  assert.equal(result.hits[0].id, 'km-00000001')
  assert.ok(result.hits[0].snippet.includes('向量'))
})

test('matches English words and ignores case', () => {
  const index = indexWith([
    { id: 'km-00000001', title: 'Harness notes', body: 'DeepSeek Harness runs plugins.' },
    { id: 'km-00000002', title: 'Other', body: 'nothing here' },
  ])
  assert.equal(index.search('deepseek harness').hits[0].id, 'km-00000001')
})

test('filters by status and tags', () => {
  const index = indexWith([
    { id: 'km-00000001', title: 'A', body: '检索', tags: ['x'], status: 'verified' },
    { id: 'km-00000002', title: 'B', body: '检索', tags: ['x'], status: 'draft' },
    { id: 'km-00000003', title: 'C', body: '检索', tags: ['y'], status: 'verified' },
  ])
  assert.deepEqual(index.search('检索', { status: 'draft' }).hits.map(hit => hit.id), ['km-00000002'])
  assert.deepEqual(index.search('检索', { tags: ['x'] }).hits.map(hit => hit.id).sort(), ['km-00000001', 'km-00000002'])
})

test('excludes archived notes unless explicitly requested', () => {
  const index = indexWith([
    { id: 'km-00000001', title: 'A', body: '检索', status: 'archived' },
    { id: 'km-00000002', title: 'B', body: '检索', status: 'verified' },
  ])
  assert.deepEqual(index.search('检索').hits.map(hit => hit.id), ['km-00000002'])
  assert.deepEqual(index.search('检索', { status: 'archived' }).hits.map(hit => hit.id), ['km-00000001'])
})

test('falls back to substring matching when tokens miss', () => {
  const index = indexWith([{ id: 'km-00000001', title: '错误码', body: 'E1024 表示超时' }])
  const result = index.search('1024')
  assert.ok(result.hits.some(hit => hit.id === 'km-00000001'))
})

test('returns an empty result for an empty query without failing', () => {
  const index = indexWith([{ id: 'km-00000001', title: 'A', body: 'B' }])
  const result = index.search('   ')
  assert.equal(result.mode, 'empty')
  assert.deepEqual(result.hits, [])
})

test('removes documents from the index', () => {
  const index = indexWith([{ id: 'km-00000001', title: 'A', body: '检索' }])
  index.remove('km-00000001')
  assert.equal(index.search('检索').hits.length, 0)
})
