import path from 'node:path'

import { DEFAULTS, loadEffectiveConfig, readSettings, settingsFilePath, writeSettings } from './config.js'

const PREFIX = '/dsh-km/api'
const MAX_BODY = 2 * 1024 * 1024

export function createRoutes({ registry, rowConfig }) {
  async function handle(request) {
    try {
      const url = new URL(request.url, 'http://localhost')
      if (!url.pathname.startsWith(PREFIX)) return json(404, { error: { code: 'not_found', message: 'unknown route' } })
      const route = url.pathname.slice(PREFIX.length) || '/'
      const method = request.method.toUpperCase()

      if (method === 'GET' && route === '/health') return json(200, { ok: true, plugin: 'dsh-km' })
      if (method === 'GET' && route === '/workspaces') {
        return json(200, { workspaces: await registry.summary() })
      }
      if (method === 'GET' && route === '/notes') {
        const workspace = await resolveWorkspace(registry, url.searchParams.get('vault'))
        const vault = await registry.forWorkspace(workspace, { create: false })
        const query = (url.searchParams.get('q') ?? '').trim()
        const status = url.searchParams.get('status') ?? ''
        const limit = clamp(url.searchParams.get('limit'), 1, 1000, 500)
        if (query) {
          const result = vault.search(query, { topK: limit, status })
          return json(200, {
            workspace,
            vault: vault.root,
            mode: result.mode,
            total: result.total,
            notes: result.hits,
          })
        }
        const notes = await vault.list({ status })
        return json(200, {
          workspace,
          vault: vault.root,
          mode: 'list',
          total: notes.length,
          notes: notes.slice(0, limit),
        })
      }
      if (method === 'GET' && route === '/note') {
        const workspace = await resolveWorkspace(registry, url.searchParams.get('vault'))
        const vault = await registry.forWorkspace(workspace, { create: false })
        const note = await vault.read(url.searchParams.get('id'))
        return json(200, { workspace, vault: vault.root, note })
      }
      if (method === 'GET' && route === '/stats') {
        const workspace = await resolveWorkspace(registry, url.searchParams.get('vault'))
        const vault = await registry.forWorkspace(workspace, { create: false })
        const stats = await vault.stats()
        return json(200, { workspace, vault: vault.root, ...stats })
      }
      if (method === 'POST' && route === '/note') {
        const body = await readJson(request)
        const workspace = await resolveWorkspace(registry, body.vault ?? body.workspace)
        const vault = await registry.forWorkspace(workspace, { create: true })
        const note = await vault.write({
          id: body.id,
          title: body.title,
          body: body.body,
          tags: body.tags,
          when: body.when,
          status: body.status,
          sources: body.sources,
        })
        return json(200, { workspace, vault: vault.root, note })
      }
      if (method === 'POST' && route === '/trash') {
        const body = await readJson(request)
        const workspace = await resolveWorkspace(registry, body.vault ?? body.workspace)
        const vault = await registry.forWorkspace(workspace, { create: false })
        const result = await vault.trash(body.id)
        return json(200, { workspace, vault: vault.root, ...result })
      }
      if (method === 'POST' && route === '/rebuild') {
        const body = await readJson(request)
        const workspace = await resolveWorkspace(registry, body.vault ?? body.workspace)
        const vault = await registry.forWorkspace(workspace, { create: false })
        await vault.reload()
        const stats = await vault.stats()
        return json(200, { workspace, vault: vault.root, ...stats })
      }
      if (method === 'GET' && route === '/settings') {
        return json(200, {
          defaults: DEFAULTS,
          settings: await readSettings(),
          effective: await loadEffectiveConfig(rowConfig),
          file: settingsFilePath(),
        })
      }
      if (method === 'POST' && route === '/settings') {
        const body = await readJson(request)
        const settings = await writeSettings(body)
        return json(200, { settings, effective: await loadEffectiveConfig(rowConfig) })
      }
      return json(404, { error: { code: 'not_found', message: 'unknown route' } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = error && error.statusCode ? error.statusCode : /not found/i.test(message) ? 404 : /invalid|must be|required|workspace/i.test(message) ? 400 : 500
      const code = error && error.code ? error.code : status === 404 ? 'not_found' : status === 400 ? 'invalid_request' : 'error'
      return json(status, { error: { code, message } })
    }
  }

  return { handle, path: PREFIX }
}

async function resolveWorkspace(registry, value) {
  const known = registry.knownWorkspaces()
  if (value === null || value === undefined || String(value).trim() === '') {
    const workingDirectory = safeGet(registry.ctx, 'workingDirectory')
    const defaultDirectory = workingDirectory?.defaultDirectory
    const preferred = known.find(item => samePath(item.path, defaultDirectory)) ?? known[0]
    if (!preferred) throw httpError(400, 'no registered workspace is available', 'no_workspace')
    return path.resolve(preferred.path)
  }
  const candidate = path.resolve(String(value))
  if (!(await registry.isKnownWorkspace(candidate))) {
    throw httpError(400, `workspace is not registered: ${candidate}`, 'unknown_workspace')
  }
  return candidate
}

function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  return process.platform === 'win32'
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right)
}

async function readJson(request) {
  const text = await request.text()
  if (text.length > MAX_BODY) throw httpError(413, 'request body is too large', 'body_too_large')
  if (!text.trim()) return {}
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('expected a JSON object')
    }
    return value
  } catch (error) {
    throw httpError(400, `invalid JSON body: ${error instanceof Error ? error.message : String(error)}`, 'invalid_json')
  }
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function httpError(status, message, code) {
  const error = new Error(message)
  error.statusCode = status
  error.code = code
  return error
}

function clamp(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function safeGet(ctx, name) {
  try {
    return ctx && typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}
