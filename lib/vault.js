import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js'
import { noteFilePath, normalizeId, relativeTo, trashFilePath } from './paths.js'
import { SearchIndex } from './search.js'

const STATUSES = new Set(['draft', 'verified', 'stale', 'archived'])
const SOURCE_TYPES = new Set(['session', 'url', 'file', 'manual', 'web'])

export class Vault {
  constructor({ root, maxNoteBytes = 1048576, watch = true }) {
    this.root = root
    this.maxNoteBytes = maxNoteBytes
    this.watchEnabled = watch
    this.notes = new Map()
    this.index = new SearchIndex()
    this.errors = []
    this.revision = 0
    this.queue = Promise.resolve()
    this.ready = null
    this.watcher = null
    this.reloadTimer = null
  }

  async init(options = {}) {
    if (this.ready) return this.ready
    const create = options.create !== false
    this.ready = (async () => {
      if (create) {
        await fsp.mkdir(path.join(this.root, 'notes'), { recursive: true })
        await fsp.mkdir(path.join(this.root, '.trash'), { recursive: true })
        await ensureGitignore(this.root)
      }
      await this.reload()
      if (this.watchEnabled) this.startWatch()
    })().catch(error => {
      this.ready = null
      throw error
    })
    return this.ready
  }

  async reload() {
    const notesDir = path.join(this.root, 'notes')
    let entries = []
    try {
      entries = await fsp.readdir(notesDir, { withFileTypes: true })
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        this.notes.clear()
        this.index.clear()
        this.errors = []
        this.revision++
        return
      }
      throw error
    }
    const files = entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map(entry => entry.name)
      .sort()

    const notes = new Map()
    const index = new SearchIndex()
    const errors = []
    for (const name of files) {
      const file = path.join(notesDir, name)
      try {
        const note = await this.readNoteFile(file, name)
        if (!note) continue
        if (notes.has(note.id)) {
          errors.push({ file: name, message: `duplicate note id ${note.id}` })
          continue
        }
        notes.set(note.id, note)
        index.add(note)
      } catch (error) {
        errors.push({ file: name, message: error instanceof Error ? error.message : String(error) })
      }
    }
    this.notes = notes
    this.index = index
    this.errors = errors
    this.revision++
  }

  async readNoteFile(file, name) {
    const stat = await fsp.stat(file)
    if (stat.size > this.maxNoteBytes) {
      throw new Error(`note exceeds maxNoteBytes (${stat.size} > ${this.maxNoteBytes})`)
    }
    const text = await fsp.readFile(file, 'utf8')
    const fallbackId = normalizeId((/(km-[0-9a-f]{8})\.md$/i.exec(name) ?? [])[1])
    let data = {}
    let body = ''
    let error = ''
    try {
      const parsed = parseFrontmatter(text)
      data = parsed.data
      body = parsed.body
    } catch (parseError) {
      error = parseError instanceof Error ? parseError.message : String(parseError)
      body = text
    }
    const id = normalizeId(data.id) ?? fallbackId
    if (!id) return null
    const fallbackTime = Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : Date.now()
    const created = isoOr(data.created, new Date(fallbackTime).toISOString())
    const updated = isoOr(data.updated, new Date(fallbackTime).toISOString())
    return {
      id,
      title: titleOr(data.title, name),
      tags: stringArray(data.tags, 20, 40),
      when: typeof data.when === 'string' ? data.when.trim().slice(0, 300) : '',
      status: STATUSES.has(data.status) ? data.status : 'draft',
      created,
      updated,
      links: idArray(data.links),
      sources: normalizeSources(data.sources),
      body: String(body ?? ''),
      path: relativeTo(this.root, file),
      error: error || undefined,
    }
  }

  async list(options = {}) {
    await this.init()
    const status = typeof options.status === 'string' ? options.status : ''
    const notes = [...this.notes.values()]
      .filter(note => (status && status !== 'any' ? note.status === status : note.status !== 'archived'))
      .sort((left, right) => Date.parse(right.updated) - Date.parse(left.updated))
    return notes.map(note => this.meta(note))
  }

  meta(note) {
    return {
      id: note.id,
      title: note.title,
      path: note.path,
      status: note.status,
      tags: note.tags,
      when: note.when,
      created: note.created,
      updated: note.updated,
      links: note.links,
      sources: note.sources,
      error: note.error,
    }
  }

  async read(id) {
    await this.init()
    const noteId = normalizeId(id)
    if (!noteId) throw new Error('invalid note id')
    const note = this.notes.get(noteId)
    if (!note) throw new Error(`note not found: ${noteId}`)
    const backlinks = [...this.notes.values()]
      .filter(candidate => candidate.links.includes(noteId))
      .map(candidate => ({ id: candidate.id, title: candidate.title }))
    return { ...this.meta(note), body: note.body, backlinks }
  }

  search(query, options = {}) {
    return this.index.search(query, options)
  }

  async write(input) {
    return this.enqueue(async () => {
      await this.init()
      const title = requireString(input.title, 'title', 300)
      const body = typeof input.body === 'string' ? input.body : ''
      if (Buffer.byteLength(body, 'utf8') > this.maxNoteBytes) {
        throw new Error(`body exceeds maxNoteBytes (${this.maxNoteBytes})`)
      }
      const requestedId = input.id === undefined ? null : normalizeId(input.id)
      if (input.id !== undefined && !requestedId) throw new Error('invalid note id')
      const existing = requestedId ? this.notes.get(requestedId) : undefined
      if (requestedId && !existing) throw new Error(`note not found: ${input.id}`)
      const status = input.status === undefined ? (existing ? existing.status : 'draft') : requireStatus(input.status)
      const tags = input.tags === undefined && existing ? existing.tags : stringArray(input.tags, 20, 40)
      const when =
        input.when === undefined && existing
          ? existing.when
          : typeof input.when === 'string'
            ? input.when.trim().slice(0, 300)
            : ''
      const sources = input.sources === undefined ? undefined : normalizeSources(input.sources)

      const now = new Date().toISOString()
      const note = existing
        ? { ...existing, title, body, tags, when, status, updated: now }
        : {
            id: '',
            title,
            body,
            tags,
            when,
            status,
            created: now,
            updated: now,
            links: [],
            sources: [],
            path: '',
          }
      note.id = existing ? existing.id : makeId()
      note.path = existing ? existing.path : relativeTo(this.root, noteFilePath(this.root, note.id, title))
      if (sources !== undefined) note.sources = sources
      if (existing) {
        note.links = existing.links
        note.sources = sources === undefined ? existing.sources : sources
      }

      await this.persist(note)
      this.notes.set(note.id, note)
      this.index.add(note)
      this.revision++
      return this.meta(note)
    })
  }

  async link(fromId, toId) {
    return this.enqueue(async () => {
      await this.init()
      const from = this.notes.get(normalizeId(fromId))
      const to = this.notes.get(normalizeId(toId))
      if (!from) throw new Error(`note not found: ${fromId}`)
      if (!to) throw new Error(`note not found: ${toId}`)
      if (from.id === to.id) throw new Error('a note cannot link to itself')
      if (!from.links.includes(to.id)) from.links.push(to.id)
      if (!to.links.includes(from.id)) to.links.push(from.id)
      await this.persist(from)
      await this.persist(to)
      this.revision++
      return { from: from.id, to: to.id, linked: true }
    })
  }

  async trash(id) {
    return this.enqueue(async () => {
      await this.init()
      const noteId = normalizeId(id)
      const note = noteId ? this.notes.get(noteId) : undefined
      if (!note) throw new Error(`note not found: ${id}`)
      const source = path.join(this.root, note.path)
      let target = trashFilePath(this.root, note.id, note.title)
      let counter = 0
      while (await exists(target)) {
        counter++
        target = target.replace(/\.md$/, `-${counter}.md`)
      }
      await fsp.mkdir(path.dirname(target), { recursive: true })
      await fsp.rename(source, target)
      this.notes.delete(note.id)
      this.index.remove(note.id)
      this.revision++
      return { id: note.id, trashPath: relativeTo(this.root, target) }
    })
  }

  async persist(note) {
    const data = {
      id: note.id,
      title: note.title,
      tags: note.tags,
      when: note.when,
      links: note.links,
      status: note.status,
      created: note.created,
      updated: note.updated,
      sources: note.sources,
    }
    const text = serializeFrontmatter(data, note.body)
    const file = path.join(this.root, note.path)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await writeAtomic(file, text)
  }

  async stats() {
    await this.init()
    const byStatus = { draft: 0, verified: 0, stale: 0, archived: 0 }
    const tagCounts = new Map()
    for (const note of this.notes.values()) {
      byStatus[note.status] = (byStatus[note.status] ?? 0) + 1
      for (const tag of note.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
    const topTags = [...tagCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }))
    return {
      total: this.notes.size,
      byStatus,
      topTags,
      errors: this.errors,
      revision: this.revision,
    }
  }

  enqueue(task) {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => {})
    return run
  }

  startWatch() {
    try {
      const notesDir = path.join(this.root, 'notes')
      this.watcher = fs.watch(notesDir, { persistent: false }, () => {
        clearTimeout(this.reloadTimer)
        this.reloadTimer = setTimeout(() => {
          this.reload().catch(() => {})
        }, 500)
      })
      this.watcher.on('error', () => {})
    } catch {
      this.watcher = null
    }
  }

  close() {
    clearTimeout(this.reloadTimer)
    if (this.watcher) {
      try {
        this.watcher.close()
      } catch {
        /* ignore */
      }
      this.watcher = null
    }
  }
}

export async function writeAtomic(file, content) {
  const temporary = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`
  await fsp.writeFile(temporary, content, 'utf8')
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(temporary, file)
      return
    } catch (error) {
      const retryable = error && ['EPERM', 'EBUSY', 'EACCES'].includes(error.code)
      if (!retryable || attempt >= 4) {
        await fsp.rm(temporary, { force: true })
        throw error
      }
      await delay([20, 50, 100, 200][attempt] ?? 200)
    }
  }
}

async function ensureGitignore(root) {
  const file = path.join(root, '.gitignore')
  try {
    await fsp.access(file)
  } catch {
    await fsp.writeFile(file, '.trash/\n*.tmp\n', 'utf8')
  }
}

async function exists(file) {
  try {
    await fsp.access(file)
    return true
  } catch {
    return false
  }
}

function makeId() {
  const bytes = new Uint8Array(4)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return 'km-' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function requireString(value, field, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`${field} must be a non-empty string`)
  if (Array.from(text).length > max) throw new Error(`${field} must be at most ${max} characters`)
  return text
}

function requireStatus(value) {
  if (!STATUSES.has(value)) throw new Error(`status must be one of ${[...STATUSES].join(', ')}`)
  return value
}

function titleOr(value, filename) {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 300)
  return filename.replace(/\.md$/i, '')
}

function isoOr(value, fallback) {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString()
  }
  return fallback
}

function stringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (!text) continue
    const clipped = Array.from(text).slice(0, maxLength).join('')
    const key = clipped.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clipped)
    if (out.length >= maxItems) break
  }
  return out
}

function idArray(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    const id = normalizeId(item)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const type = typeof item.type === 'string' && SOURCE_TYPES.has(item.type) ? item.type : 'manual'
    const ref = typeof item.ref === 'string' ? item.ref.trim().slice(0, 2000) : ''
    if (!ref) continue
    const source = { type, ref }
    if (typeof item.locator === 'string' && item.locator.trim()) source.locator = item.locator.trim().slice(0, 500)
    if (typeof item.capturedAt === 'string' && Number.isFinite(Date.parse(item.capturedAt))) {
      source.capturedAt = new Date(item.capturedAt).toISOString()
    }
    out.push(source)
    if (out.length >= 20) break
  }
  return out
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
