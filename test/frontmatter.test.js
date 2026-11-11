import assert from 'node:assert/strict'
import test from 'node:test'

import { serializeFrontmatter, parseFrontmatter, FrontmatterError } from '../lib/frontmatter.js'

test('round-trips the note frontmatter shape', () => {
  const data = {
    id: 'km-1a2b3c4d',
    title: '检索方案：BM25 与向量',
    tags: ['检索', '架构'],
    when: '当需要决定检索方案时',
    links: ['km-9f8e7d6c'],
    status: 'verified',
    created: '2026-11-11T09:00:00.000Z',
    updated: '2026-11-11T09:30:00.000Z',
    sources: [
      { type: 'session', ref: 'sess_ab12', locator: 'seq:41-47', capturedAt: '2026-11-11T09:00:00.000Z' },
      { type: 'url', ref: 'https://example.com/spec?x=1' },
    ],
  }
  const text = serializeFrontmatter(data, '# 正文\n\n- 结论')
  const parsed = parseFrontmatter(text)
  assert.deepEqual(parsed.data, data)
  assert.equal(parsed.body, '# 正文\n\n- 结论')
})

test('parses a hand-written block sequence and inline sequences', () => {
  const text = [
    '---',
    'title: 手写笔记',
    'tags: [a, "b c", 中文]',
    'status: draft',
    'sources:',
    '  - {type: url, ref: "https://example.com/a", capturedAt: "2026-11-11T00:00:00Z"}',
    '  - {type: file, ref: "docs/spec.md"}',
    '---',
    '',
    'body',
  ].join('\n')
  const parsed = parseFrontmatter(text)
  assert.equal(parsed.data.title, '手写笔记')
  assert.deepEqual(parsed.data.tags, ['a', 'b c', '中文'])
  assert.equal(parsed.data.sources.length, 2)
  assert.equal(parsed.data.sources[1].ref, 'docs/spec.md')
  assert.equal(parsed.body, 'body')
})

test('treats an empty scalar as a string and empty known keys as arrays', () => {
  const parsed = parseFrontmatter(['---', 'title:', 'tags:', 'links:', '---', '', 'x'].join('\n'))
  assert.equal(parsed.data.title, '')
  assert.deepEqual(parsed.data.tags, [])
  assert.deepEqual(parsed.data.links, [])
})

test('ignores files without frontmatter', () => {
  const parsed = parseFrontmatter('# just markdown')
  assert.equal(parsed.hasFrontmatter, false)
  assert.equal(parsed.body, '# just markdown')
})

test('rejects an unterminated block', () => {
  assert.throws(() => parseFrontmatter('---\ntitle: x\n'), FrontmatterError)
})

test('rejects unsupported indentation', () => {
  assert.throws(() => parseFrontmatter('---\n  nested: x\n---\n'), FrontmatterError)
})

test('quotes values that would change meaning', () => {
  const data = { title: 'a: b', when: 'x # y', tags: ['true', '42'], sources: [] }
  const text = serializeFrontmatter(data, '')
  const parsed = parseFrontmatter(text)
  assert.equal(parsed.data.title, 'a: b')
  assert.equal(parsed.data.when, 'x # y')
  assert.deepEqual(parsed.data.tags, ['true', '42'])
  assert.deepEqual(parsed.data.sources, [])
})
