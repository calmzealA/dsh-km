import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createRoutes } from '../lib/routes.js'
import { VaultRegistry } from '../lib/vaults.js'

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-home-'))
process.env.DSH_HOME = home

async function setup() {
  const workspace = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-km-ws-'))
  const ctx = {
    get(name) {
      if (name === 'workingDirectory') return { defaultDirectory: workspace }
      if (name === 'workspaceRegistry') return { list: () => [{ id: 'w1', title: 'Demo', path: workspace }] }
      return undefined
    },
  }
  const registry = new VaultRegistry({ ctx, rowConfig: {} })
  const routes = createRoutes({ registry, rowConfig: {} })
  const server = http.createServer((req, res) => routes.handle(req, res))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { workspace, registry, routes, server, base }
}

async function call(base, pathname, init) {
  const response = await fetch(base + pathname, init)
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

test('lists workspaces and rejects unknown ones', async t => {
  const { workspace, server, base } = await setup()
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await fsp.rm(workspace, { recursive: true, force: true })
  })
  const list = await call(base, '/dsh-km/api/workspaces')
  assert.equal(list.status, 200)
  assert.equal(list.body.workspaces.length, 1)

  const denied = await call(base, '/dsh-km/api/notes?vault=' + encodeURIComponent(path.join(os.tmpdir(), 'other')))
  assert.equal(denied.status, 400)
  assert.equal(denied.body.error.code, 'unknown_workspace')

  const health = await call(base, '/dsh-km/api/health')
  assert.equal(health.status, 200)
  assert.equal(health.body.ok, true)
})

test('creates, lists, reads and trashes a note over HTTP', async t => {
  const { workspace, server, base } = await setup()
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await fsp.rm(workspace, { recursive: true, force: true })
  })
  const created = await call(base, '/dsh-km/api/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      vault: workspace,
      title: '知识库设计',
      body: '用 Markdown 做真源，索引是派生物。',
      tags: ['设计'],
      when: '当讨论知识库存储时',
      status: 'verified',
    }),
  })
  assert.equal(created.status, 200)
  const id = created.body.note.id
  assert.match(id, /^km-[0-9a-f]{8}$/)

  const list = await call(base, '/dsh-km/api/notes?vault=' + encodeURIComponent(workspace) + '&q=' + encodeURIComponent('索引'))
  assert.equal(list.status, 200)
  assert.ok(list.body.notes.some(note => note.id === id))
  assert.ok(list.body.notes[0].updated)

  const read = await call(base, '/dsh-km/api/note?vault=' + encodeURIComponent(workspace) + '&id=' + id)
  assert.equal(read.status, 200)
  assert.equal(read.body.note.title, '知识库设计')

  const trashed = await call(base, '/dsh-km/api/trash', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vault: workspace, id }),
  })
  assert.equal(trashed.status, 200)
  assert.match(trashed.body.trashPath, /^\.trash\//)
})

test('validates ids, bodies and settings', async t => {
  const { workspace, server, base } = await setup()
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await fsp.rm(workspace, { recursive: true, force: true })
  })
  const badId = await call(base, '/dsh-km/api/note?vault=' + encodeURIComponent(workspace) + '&id=' + encodeURIComponent('../x'))
  assert.equal(badId.status, 400)

  const badJson = await call(base, '/dsh-km/api/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  assert.equal(badJson.status, 400)

  const settings = await call(base, '/dsh-km/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ searchTopK: 5 }),
  })
  assert.equal(settings.status, 200)
  assert.equal(settings.body.effective.searchTopK, 5)

  const unknown = await call(base, '/dsh-km/api/nope')
  assert.equal(unknown.status, 404)
})
