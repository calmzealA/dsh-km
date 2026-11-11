import path from 'node:path'

import { relativeTo } from './paths.js'

const STATUS_VALUES = ['draft', 'verified', 'stale', 'archived']
const SEARCH_STATUS = ['any', ...STATUS_VALUES]

const SOURCE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['session', 'url', 'file', 'manual', 'web'] },
    ref: { type: 'string' },
    locator: { type: 'string' },
    capturedAt: { type: 'string' },
  },
  required: ['ref'],
  additionalProperties: false,
}

const HIT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    path: { type: 'string' },
    status: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    when: { type: 'string' },
    score: { type: 'number' },
    snippet: { type: 'string' },
    sources: { type: 'array', items: SOURCE_SCHEMA },
    updated: { type: 'string' },
  },
  required: ['id', 'title', 'path', 'status', 'score', 'snippet'],
  additionalProperties: false,
}

const SEARCH_PARAMETERS = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Search text. CJK is matched by character bigrams and Latin by words. Empty string lists the most recently updated notes instead.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only return notes carrying every one of these tags.',
    },
    status: {
      type: 'string',
      enum: SEARCH_STATUS,
      description: 'Filter by review status; defaults to every status except archived.',
    },
    topK: {
      type: 'number',
      description: 'Maximum number of notes to return (1-50). Defaults to the configured value.',
    },
    workspace: {
      type: 'string',
      description: 'Absolute path of a registered workspace. Omit to use the calling session workspace.',
    },
  },
  required: ['query'],
  additionalProperties: false,
}

const SEARCH_OUTPUT = {
  type: 'object',
  properties: {
    vault: { type: 'string' },
    mode: { type: 'string' },
    total: { type: 'number' },
    truncated: { type: 'boolean' },
    hits: { type: 'array', items: HIT_SCHEMA },
  },
  required: ['vault', 'mode', 'total', 'truncated', 'hits'],
  additionalProperties: false,
}

const READ_PARAMETERS = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Note id, exactly as returned by km_search (km-xxxxxxxx).' },
    maxChars: { type: 'number', description: 'Maximum body characters to return (200-40000, default 8000).' },
    workspace: { type: 'string', description: 'Absolute path of a registered workspace.' },
  },
  required: ['id'],
  additionalProperties: false,
}

const READ_OUTPUT = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    path: { type: 'string' },
    status: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    when: { type: 'string' },
    created: { type: 'string' },
    updated: { type: 'string' },
    sources: { type: 'array', items: SOURCE_SCHEMA },
    links: { type: 'array', items: { type: 'string' } },
    backlinks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, title: { type: 'string' } },
        required: ['id', 'title'],
        additionalProperties: false,
      },
    },
    body: { type: 'string' },
    truncated: { type: 'boolean' },
  },
  required: ['id', 'title', 'path', 'status', 'tags', 'when', 'sources', 'links', 'backlinks', 'body', 'truncated'],
  additionalProperties: false,
}

const WRITE_PARAMETERS = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short, specific note title.' },
    body: { type: 'string', description: 'Markdown body. Keep it a durable conclusion, not a transcript.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Up to 20 short tags.' },
    when: {
      type: 'string',
      description: 'One line: when should this note come to mind? This line is indexed for recall.',
    },
    status: {
      type: 'string',
      enum: ['draft', 'verified', 'stale'],
      description: 'Review status. New model-written notes default to draft.',
    },
    sources: {
      type: 'array',
      items: SOURCE_SCHEMA,
      description: 'Where the content came from: session id, URL, file path, or manual.',
    },
    id: { type: 'string', description: 'Existing note id to update. Omit to create a new note.' },
    workspace: { type: 'string', description: 'Absolute path of a registered workspace.' },
  },
  required: ['title', 'body'],
  additionalProperties: false,
}

const WRITE_OUTPUT = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    path: { type: 'string' },
    status: { type: 'string' },
    created: { type: 'string' },
    updated: { type: 'string' },
  },
  required: ['id', 'path', 'status', 'created', 'updated'],
  additionalProperties: false,
}

const LINK_PARAMETERS = {
  type: 'object',
  properties: {
    from: { type: 'string', description: 'Source note id (km-xxxxxxxx).' },
    to: { type: 'string', description: 'Target note id (km-xxxxxxxx).' },
    workspace: { type: 'string', description: 'Absolute path of a registered workspace.' },
  },
  required: ['from', 'to'],
  additionalProperties: false,
}

const LINK_OUTPUT = {
  type: 'object',
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    linked: { type: 'boolean' },
  },
  required: ['from', 'to', 'linked'],
  additionalProperties: false,
}

export function registerTools(ctx, { registry }) {
  const tools = ctx.get('tools')
  if (!tools) throw new Error('dsh-km requires the tools service')

  const resolveWorkspace = async (exec, requested) => {
    if (typeof requested === 'string' && requested.trim()) {
      const candidate = path.resolve(requested.trim())
      if (!(await registry.isKnownWorkspace(candidate))) {
        throw new Error(`workspace is not registered: ${candidate}`)
      }
      return candidate
    }
    const workingDirectory = ctx.get('workingDirectory')
    if (workingDirectory && exec && exec.agent) {
      return await workingDirectory.ensure(exec.agent, exec.signal)
    }
    if (workingDirectory && workingDirectory.defaultDirectory) return workingDirectory.defaultDirectory
    return process.cwd()
  }

  const open = async (workspace, create) => {
    const vault = await registry.forWorkspace(workspace, { create })
    return vault
  }

  ctx.effect(() =>
    tools.register({
      name: 'km_search',
      description:
        'Search the workspace knowledge base (local Markdown notes) for durable conclusions, decisions and references. Returns note ids, titles, review status, a "when to recall" line, snippets and sources. Use km_read with a returned id for the full note. Empty query lists recently updated notes. This is not a transcript search: use session history tools for raw conversations.',
      parameters: SEARCH_PARAMETERS,
      output: { schema: SEARCH_OUTPUT, render: (_args, value) => asText(renderSearch(value)) },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const config = await registry.config()
        const workspace = await resolveWorkspace(exec, args.workspace)
        const vault = await open(workspace, false)
        const topK = clamp(args.topK, 1, 50, config.searchTopK)
        const query = typeof args.query === 'string' ? args.query : ''
        let result
        if (!query.trim()) {
          const notes = await vault.list({ status: typeof args.status === 'string' ? args.status : '' })
          result = { mode: 'recent', total: notes.length, hits: notes.slice(0, topK).map(note => recentHit(note)) }
        } else {
          result = vault.search(query, {
            topK,
            tags: Array.isArray(args.tags) ? args.tags : [],
            status: typeof args.status === 'string' ? args.status : '',
          })
        }
        const fitted = fitHits(result.hits, config.maxResultChars)
        return {
          vault: displayVault(workspace, vault.root),
          mode: result.mode,
          total: result.total,
          truncated: fitted.truncated,
          hits: fitted.hits,
        }
      },
    }),
  )

  ctx.effect(() =>
    tools.register({
      name: 'km_read',
      description:
        'Read one knowledge-base note by id, including frontmatter, body, sources, links and backlinks. Use this after km_search when the snippet is not enough. Bodies longer than maxChars are truncated with a marker.',
      parameters: READ_PARAMETERS,
      output: { schema: READ_OUTPUT, render: (_args, value) => asText(renderRead(value)) },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const workspace = await resolveWorkspace(exec, args.workspace)
        const vault = await open(workspace, false)
        const note = await vault.read(args.id)
        const maxChars = clamp(args.maxChars, 200, 40000, 8000)
        const body = String(note.body ?? '')
        const truncated = body.length > maxChars
        return {
          id: note.id,
          title: note.title,
          path: note.path,
          status: note.status,
          tags: note.tags,
          when: note.when,
          created: note.created,
          updated: note.updated,
          sources: note.sources,
          links: note.links,
          backlinks: note.backlinks,
          body: truncated ? body.slice(0, maxChars) + '\n\n[truncated]' : body,
          truncated,
        }
      },
    }),
  )

  ctx.effect(() =>
    tools.register({
      name: 'km_write',
      description:
        'Create or update a knowledge-base note. Use it for durable conclusions, decisions and references the user will want later, not for transient reasoning. New notes default to status "draft" so the user can review them. Set "when" to the situation in which this note should be recalled. Returns the stable note id; cite it as [km-id] in answers.',
      parameters: WRITE_PARAMETERS,
      output: { schema: WRITE_OUTPUT, render: (_args, value) => asText(renderWrite(value)) },
      async execute(args, exec) {
        const workspace = await resolveWorkspace(exec, args.workspace)
        const vault = await open(workspace, true)
        const note = await vault.write({
          id: args.id,
          title: args.title,
          body: args.body,
          tags: args.tags,
          when: args.when,
          status: args.status,
          sources: normalizeToolSources(args.sources),
        })
        return {
          id: note.id,
          path: note.path,
          status: note.status,
          created: note.created,
          updated: note.updated,
        }
      },
    }),
  )

  ctx.effect(() =>
    tools.register({
      name: 'km_link',
      description:
        'Create a bidirectional link between two knowledge-base notes. Use it when one conclusion depends on, supersedes, or explains another. Both ids must exist; the link is written into both notes.',
      parameters: LINK_PARAMETERS,
      output: { schema: LINK_OUTPUT, render: (_args, value) => asText(renderLink(value)) },
      async execute(args, exec) {
        const workspace = await resolveWorkspace(exec, args.workspace)
        const vault = await open(workspace, true)
        return await vault.link(args.from, args.to)
      },
    }),
  )
}

function asText(text) {
  return [{ type: 'text', text }]
}

function recentHit(note) {
  return {
    id: note.id,
    title: note.title,
    path: note.path,
    status: note.status,
    tags: note.tags,
    when: note.when,
    score: 0,
    snippet: String(note.body ?? '').replace(/\s+/g, ' ').slice(0, 180),
    sources: note.sources ?? [],
    updated: note.updated ?? '',
  }
}

function normalizeToolSources(value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('sources must be an array')
  return value
}

function fitHits(hits, budget) {
  const out = []
  let size = 0
  for (const hit of hits) {
    const cost = JSON.stringify(hit).length + 2
    if (size + cost > budget && out.length > 0) return { hits: out, truncated: true }
    out.push(hit)
    size += cost
  }
  return { hits: out, truncated: false }
}

function renderSearch(value) {
  const header = `Knowledge base ${value.vault} — ${value.total} note(s), ${value.hits.length} shown (${value.mode})`
  if (!value.hits.length) {
    return `${header}\nNo matching notes. Record a durable conclusion with km_write, or add one in the knowledge panel.`
  }
  const lines = [header]
  for (const [index, hit] of value.hits.entries()) {
    lines.push('')
    lines.push(`[${index + 1}] ${hit.id} · ${hit.title} · ${hit.status}${hit.score ? ` · score ${hit.score}` : ''}`)
    lines.push(`    path: ${hit.path}`)
    if (hit.when) lines.push(`    when: ${hit.when}`)
    if (hit.tags?.length) lines.push(`    tags: ${hit.tags.join(', ')}`)
    if (hit.snippet) lines.push(`    ${hit.snippet}`)
    if (hit.sources?.length) lines.push(`    sources: ${hit.sources.map(sourceLabel).join('; ')}`)
  }
  if (value.truncated) lines.push('\n[more hits omitted by the result budget]')
  return lines.join('\n')
}

function renderRead(value) {
  const lines = [
    `${value.id} · ${value.title}`,
    `status: ${value.status} · path: ${value.path}`,
    `when: ${value.when || '(not set)'}`,
    `tags: ${value.tags.length ? value.tags.join(', ') : '(none)'}`,
    `updated: ${value.updated}`,
  ]
  if (value.sources.length) lines.push(`sources: ${value.sources.map(sourceLabel).join('; ')}`)
  if (value.links.length) lines.push(`links: ${value.links.join(', ')}`)
  if (value.backlinks.length) lines.push(`backlinks: ${value.backlinks.map(item => `${item.id} ${item.title}`).join('; ')}`)
  lines.push('', value.body || '(empty body)')
  if (value.truncated) lines.push('', '[body truncated; raise maxChars or open the note in the panel]')
  return lines.join('\n')
}

function renderWrite(value) {
  return `Saved ${value.id} (${value.status})\npath: ${value.path}\nPick it up later with km_read or cite it as [${value.id}].`
}

function renderLink(value) {
  return `Linked ${value.from} <-> ${value.to}.`
}

function sourceLabel(source) {
  const locator = source.locator ? ` (${source.locator})` : ''
  return `${source.type}:${source.ref}${locator}`
}

function displayVault(workspace, root) {
  const relative = relativeTo(workspace, root)
  return relative && !relative.startsWith('..') ? relative : root
}

function clamp(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}
