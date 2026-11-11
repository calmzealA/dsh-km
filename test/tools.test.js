import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { registerTools } from '../lib/tools.js'
import { VaultRegistry } from '../lib/vaults.js'

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-tools-home-'))
process.env.DSH_HOME = home

async function setup() {
  const workspace = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-tools-ws-'))
  const definitions = new Map()
  const ctx = {
    effect(fn) {
      const dispose = fn()
      return dispose ?? (() => {})
    },
    get(name) {
      if (name === 'tools') {
        return {
          register(definition) {
            definitions.set(definition.name, definition)
            return () => definitions.delete(definition.name)
          },
        }
      }
      if (name === 'workingDirectory') {
        return { defaultDirectory: workspace, ensure: async () => workspace }
      }
      if (name === 'workspaceRegistry') {
        return { list: () => [{ id: 'w1', title: 'Demo', path: workspace }] }
      }
      return undefined
    },
  }
  const registry = new VaultRegistry({ ctx, rowConfig: {} })
  registerTools(ctx, { registry })
  return { workspace, definitions, registry }
}

const exec = { agent: { id: 'session-1' }, signal: new AbortController().signal }

test('registers exactly the four knowledge tools', async t => {
  const { workspace, definitions } = await setup()
  t.after(() => fsp.rm(workspace, { recursive: true, force: true }))
  assert.deepEqual([...definitions.keys()].sort(), ['km_link', 'km_read', 'km_search', 'km_write'])
  for (const definition of definitions.values()) {
    assert.equal(typeof definition.execute, 'function')
    assert.equal(definition.parameters.type, 'object')
    assert.equal(definition.output.schema.type, 'object')
  }
})

test('writes, searches, reads and links through the tool surface', async t => {
  const { workspace, definitions } = await setup()
  t.after(() => fsp.rm(workspace, { recursive: true, force: true }))
  const write = definitions.get('km_write')
  const first = await write.execute(
    {
      title: '检索设计',
      body: 'BM25 与向量检索的取舍。',
      tags: ['检索'],
      when: '当选择检索方案时',
      sources: [{ type: 'session', ref: 'sess_1', locator: 'seq:1-3' }],
    },
    exec,
  )
  assert.match(first.id, /^km-[0-9a-f]{8}$/)
  assert.equal(first.status, 'draft')

  const search = await definitions.get('km_search').execute({ query: '向量检索' }, exec)
  assert.equal(search.mode, 'bm25')
  assert.equal(search.hits[0].id, first.id)
  assert.equal(search.vault, '.dsh-km')

  const read = await definitions.get('km_read').execute({ id: first.id }, exec)
  assert.equal(read.title, '检索设计')
  assert.equal(read.sources[0].ref, 'sess_1')

  const second = await write.execute({ title: '部署记录', body: '测试环境部署完成。' }, exec)
  const linked = await definitions.get('km_link').execute({ from: first.id, to: second.id }, exec)
  assert.equal(linked.linked, true)
  const reread = await definitions.get('km_read').execute({ id: first.id }, exec)
  assert.deepEqual(reread.links, [second.id])
  assert.deepEqual(reread.backlinks.map(item => item.id), [second.id])

  const recent = await definitions.get('km_search').execute({ query: '' }, exec)
  assert.equal(recent.mode, 'recent')
  assert.equal(recent.hits.length, 2)
})

test('rejects unknown workspaces and invalid ids from the model', async t => {
  const { workspace, definitions } = await setup()
  t.after(() => fsp.rm(workspace, { recursive: true, force: true }))
  await assert.rejects(
    () => definitions.get('km_search').execute({ query: 'x', workspace: path.join(os.tmpdir(), 'nope') }, exec),
    /not registered/,
  )
  await assert.rejects(() => definitions.get('km_read').execute({ id: '../etc/passwd' }, exec), /invalid note id/)
  await assert.rejects(
    () => definitions.get('km_write').execute({ title: 'x', body: 'y', status: 'nope' }, exec),
    /status/,
  )
})

test('truncates long bodies on read', async t => {
  const { workspace, definitions } = await setup()
  t.after(() => fsp.rm(workspace, { recursive: true, force: true }))
  const written = await definitions
    .get('km_write')
    .execute({ title: '长文', body: 'a'.repeat(500) }, exec)
  const read = await definitions.get('km_read').execute({ id: written.id, maxChars: 200 }, exec)
  assert.equal(read.truncated, true)
  assert.ok(read.body.length < 260)
  assert.match(read.body, /\[truncated\]/)
})
