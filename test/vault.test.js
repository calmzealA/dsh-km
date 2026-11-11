import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { Vault } from '../lib/vault.js'

async function makeVault() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-vault-'))
  const vault = new Vault({ root, watch: false })
  await vault.init()
  return { root, vault }
}

test('creates the vault layout and a gitignore', async t => {
  const { root, vault } = await makeVault()
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  assert.equal((await fsp.stat(path.join(root, 'notes'))).isDirectory(), true)
  assert.equal((await fsp.stat(path.join(root, '.trash'))).isDirectory(), true)
  assert.match(await fsp.readFile(path.join(root, '.gitignore'), 'utf8'), /\.trash\//)
  vault.close()
})

test('writes, reads and searches a note', async t => {
  const { root, vault } = await makeVault()
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const written = await vault.write({
    title: '检索方案选型',
    body: '我们比较了 BM25 与向量检索，选择混合检索。',
    tags: ['检索', '架构'],
    when: '当需要决定检索方案时',
    sources: [{ type: 'session', ref: 'sess_1', locator: 'seq:1-4' }],
  })
  assert.match(written.id, /^km-[0-9a-f]{8}$/)
  assert.equal(written.status, 'draft')

  const read = await vault.read(written.id)
  assert.equal(read.title, '检索方案选型')
  assert.equal(read.when, '当需要决定检索方案时')
  assert.equal(read.sources[0].ref, 'sess_1')

  const result = vault.search('向量检索')
  assert.equal(result.hits[0].id, written.id)
  vault.close()
})

test('updates without losing created time or status when omitted', async t => {
  const { root, vault } = await makeVault()
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const created = await vault.write({ title: 'A', body: 'one', status: 'verified', tags: ['x'], when: 'w' })
  const updated = await vault.write({ id: created.id, title: 'A2', body: 'two' })
  assert.equal(updated.id, created.id)
  assert.equal(updated.created, created.created)
  assert.equal(updated.status, 'verified')
  const read = await vault.read(created.id)
  assert.deepEqual(read.tags, ['x'])
  assert.equal(read.when, 'w')
  vault.close()
})

test('links notes bidirectionally and reports backlinks', async t => {
  const { root, vault } = await makeVault()
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const first = await vault.write({ title: 'A', body: 'a' })
  const second = await vault.write({ title: 'B', body: 'b' })
  await vault.link(first.id, second.id)
  const read = await vault.read(first.id)
  assert.deepEqual(read.links, [second.id])
  assert.deepEqual(read.backlinks.map(item => item.id), [second.id])
  await assert.rejects(() => vault.link(first.id, first.id), /itself/)
  vault.close()
})

test('moves a note to the trash and keeps the file', async t => {
  const { root, vault } = await makeVault()
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const written = await vault.write({ title: '待删', body: 'x' })
  const result = await vault.trash(written.id)
  assert.match(result.trashPath, /^\.trash\//)
  await fsp.stat(path.join(root, result.trashPath))
  await assert.rejects(() => vault.read(written.id), /not found/)
  assert.equal((await vault.stats()).total, 0)
  vault.close()
})

test('serializes concurrent writes without losing any', async t => {
  const { root, vault } = await makeVault()
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const writes = Array.from({ length: 12 }, (_, index) =>
    vault.write({ title: `并发 ${index}`, body: `内容 ${index}`, tags: ['并发'] }),
  )
  const results = await Promise.all(writes)
  assert.equal(new Set(results.map(item => item.id)).size, 12)
  const files = await fsp.readdir(path.join(root, 'notes'))
  assert.equal(files.filter(name => name.endsWith('.md')).length, 12)
  assert.equal((await vault.stats()).total, 12)
  vault.close()
})

test('reloads hand-written notes from disk', async t => {
  const { root, vault } = await makeVault()
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const text = [
    '---',
    'id: km-aaaaaaaa',
    'title: 手工笔记',
    'tags: [手工]',
    'status: verified',
    '---',
    '',
    '手写正文，包含 知识管理。',
  ].join('\n')
  await fsp.writeFile(path.join(root, 'notes', 'hand-km-aaaaaaaa.md'), text, 'utf8')
  await vault.reload()
  const note = await vault.read('km-aaaaaaaa')
  assert.equal(note.title, '手工笔记')
  assert.equal(note.status, 'verified')
  assert.match(note.body, /知识管理/)
  vault.close()
})

test('rejects oversized bodies and invalid statuses', async t => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-limit-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const vault = new Vault({ root, watch: false, maxNoteBytes: 4096 })
  await vault.init()
  await assert.rejects(() => vault.write({ title: 'x', body: 'a'.repeat(5000) }), /maxNoteBytes/)
  await assert.rejects(() => vault.write({ title: 'x', body: 'y', status: 'nope' }), /status/)
  await assert.rejects(() => vault.write({ title: '   ', body: 'y' }), /title/)
  vault.close()
})

test('starts clean when the vault directory does not exist', async t => {
  const root = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-empty-')), '.dsh-km')
  t.after(() => fsp.rm(path.dirname(root), { recursive: true, force: true }))
  const vault = new Vault({ root, watch: false })
  await vault.init({ create: false })
  assert.equal((await vault.stats()).total, 0)
  assert.deepEqual(vault.search('anything').hits, [])
  vault.close()
})
