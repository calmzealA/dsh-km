import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
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
  return { workspace, registry, routes }
}

async function call(routes, pathname, init) {
  const response = await routes.handle(new Request('http://localhost' + pathname, init))
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

test('lists workspaces and rejects unknown ones', async t => {
  const { workspace, routes } = await setup()
  t.after(() => fsp.rm(workspace, { recursive: true, force: true }))
  const list = await call(routes, '/dsh-km/api/workspaces')
  assert.equal(list.status, 200)
  assert.equal(list.body.workspaces.length, 1)

  const denied = await call(routes, '/dsh-km/api/notes?vault=' + encodeURIComponent(path.join(os.tmpdir(), 'other')))
  assert.equal(denied.status, 400)
  assert.equal(denied.body.error.code, 'unknown_workspace')
})

test('creates, lists, reads and trashes a note over HTTP', async t => {
  const { workspace, routes } = await setup()
  t.after(() => fsp.rm(workspace, { recursive: true, force: true }))
  const created = await call(routes, '/dsh-km/api/note', {
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

  const list = await call(routes, '/dsh-km/api/notes?vault=' + encodeURIComponent(workspace) + '&q=' + encodeURIComponent('索引'))
  assert.equal(list.status, 200)
  assert.ok(list.body.notes.some(note => note.id === id))

  const read = await call(
    routes,
    '/dsh-km/api/note?vault=' + encodeURIComponent(workspace) + '&id=' + id,
  )
  assert.equal(read.status, 200)
  assert.equal(read.body.note.title, '知识库设计')

  const trashed = await call(routes, '/dsh-km/api/trash', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vault: workspace, id }),
  })
  assert.equal(trashed.status, 200)
  assert.match(trashed.body.trashPath, /^\.trash\//)
})

test('validates ids, bodies and settings', async t => {
  const { workspace, routes } = await setup()
  t.after(() => fsp.rm(workspace, { recursive: true, force: true }))
  const badId = await call(
    routes,
    '/dsh-km/api/note?vault=' + encodeURIComponent(workspace) + '&id=' + encodeURIComponent('../x'),
  )
  assert.equal(badId.status, 400)

  const badJson = await call(routes, '/dsh-km/api/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  })
  assert.equal(badJson.status, 400)

  const settings = await call(routes, '/dsh-km/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ searchTopK: 5 }),
  })
  assert.equal(settings.status, 200)
  assert.equal(settings.body.effective.searchTopK, 5)

  const unknown = await call(routes, '/dsh-km/api/nope')
  assert.equal(unknown.status, 404)
})
