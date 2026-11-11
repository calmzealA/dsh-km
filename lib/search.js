import { normalizeText, tokenCounts, tokenize, uniqueTokens } from './tokenize.js'

export const FIELD_WEIGHTS = { title: 3, when: 2, tags: 2, body: 1 }
const K1 = 1.2
const B = 0.75
const STATUS_WEIGHT = { verified: 1.2, draft: 0.9, stale: 0.6, archived: 0.2 }
const RECENT_MS = 30 * 24 * 60 * 60 * 1000

export function buildDocument(note) {
  const fields = {
    title: tokenize(note.title),
    when: tokenize(note.when),
    tags: tokenize((note.tags ?? []).join(' ')),
    body: tokenize(note.body),
  }
  const tf = {}
  const lens = {}
  const all = new Set()
  for (const [field, tokens] of Object.entries(fields)) {
    tf[field] = tokenCounts(tokens)
    lens[field] = tokens.length
    for (const token of tokens) all.add(token)
  }
  return {
    id: note.id,
    title: note.title,
    path: note.path,
    status: note.status,
    tags: note.tags ?? [],
    when: note.when ?? '',
    body: note.body ?? '',
    sources: note.sources ?? [],
    updated: note.updated ?? '',
    updatedMs: parseTime(note.updated),
    tf,
    lens,
    all,
    tagsNorm: (note.tags ?? []).map(normalizeText),
  }
}

export class SearchIndex {
  constructor() {
    this.docs = new Map()
  }

  get size() {
    return this.docs.size
  }

  add(note) {
    this.docs.set(note.id, buildDocument(note))
  }

  remove(id) {
    this.docs.delete(id)
  }

  clear() {
    this.docs.clear()
  }

  /**
   * Weighted BM25 over four fields, with status and recency multipliers.
   * Returns compact hit objects; snippets are extracted here so callers do not
   * need the body.
   */
  search(query, options = {}) {
    const topK = clamp(options.topK ?? 8, 1, 50)
    const qTokens = uniqueTokens(query)
    const status = typeof options.status === 'string' && options.status !== 'any' ? options.status : ''
    const tagFilter = (options.tags ?? []).map(normalizeText).filter(Boolean)

    const pool = []
    for (const doc of this.docs.values()) {
      if (status ? doc.status !== status : doc.status === 'archived') continue
      if (tagFilter.length && !tagFilter.every(tag => doc.tagsNorm.includes(tag))) continue
      pool.push(doc)
    }

    if (qTokens.length === 0) {
      return { mode: 'empty', hits: [], total: pool.length }
    }

    const total = pool.length || 1
    const documentFrequency = new Map()
    for (const token of qTokens) {
      let count = 0
      for (const doc of pool) if (doc.all.has(token)) count++
      documentFrequency.set(token, count)
    }
    const averages = {}
    for (const field of Object.keys(FIELD_WEIGHTS)) {
      averages[field] = pool.reduce((sum, doc) => sum + doc.lens[field], 0) / total || 1
    }

    const scored = []
    for (const doc of pool) {
      let score = 0
      let covered = 0
      for (const token of qTokens) {
        const frequency = documentFrequency.get(token) ?? 0
        if (!frequency) continue
        covered++
        const idf = Math.log(1 + (total - frequency + 0.5) / (frequency + 0.5))
        for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
          const termFrequency = doc.tf[field].get(token) ?? 0
          if (!termFrequency) continue
          const length = doc.lens[field] || 1
          const norm = 1 - B + B * (length / (averages[field] || 1))
          score += weight * idf * (termFrequency * (K1 + 1)) / (termFrequency + K1 * norm)
        }
      }
      if (!covered) continue
      if (covered === qTokens.length) score *= 1.3
      score *= STATUS_WEIGHT[doc.status] ?? 0.8
      const age = Date.now() - doc.updatedMs
      if (age >= 0 && age < RECENT_MS) score *= 1.05
      scored.push({ doc, score })
    }

    scored.sort((left, right) => right.score - left.score || right.doc.updatedMs - left.doc.updatedMs)

    if (scored.length === 0) {
      const fallbackHits = fallbackSearch(pool, query, topK)
      return { mode: fallbackHits.length ? 'fallback' : 'none', hits: fallbackHits, total: pool.length }
    }

    const hits = scored.slice(0, topK).map(({ doc, score }) => ({
      id: doc.id,
      title: doc.title,
      path: doc.path,
      status: doc.status,
      tags: doc.tags,
      when: doc.when,
      score: Math.round(score * 1000) / 1000,
      snippet: makeSnippet(doc.body, qTokens, query),
      sources: doc.sources,
      updated: doc.updated,
    }))
    return { mode: 'bm25', hits, total: scored.length }
  }
}

function fallbackSearch(pool, query, topK) {
  const needle = normalizeText(query).trim()
  if (needle.length < 2) return []
  const hits = []
  for (const doc of pool) {
    const title = normalizeText(doc.title)
    const body = normalizeText(doc.body)
    const index = title.includes(needle) ? 0 : body.indexOf(needle)
    if (!title.includes(needle) && index < 0) continue
    hits.push({
      id: doc.id,
      title: doc.title,
      path: doc.path,
      status: doc.status,
      tags: doc.tags,
      when: doc.when,
      score: 0.1,
      snippet: makeSnippet(doc.body, [], query),
      sources: doc.sources,
      updated: doc.updated,
    })
    if (hits.length >= topK) break
  }
  return hits
}

export function makeSnippet(body, tokens, rawQuery, limit = 180) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const haystack = text.toLowerCase()
  let index = -1
  for (const token of tokens) {
    const found = haystack.indexOf(token)
    if (found >= 0) {
      index = found
      break
    }
  }
  if (index < 0) {
    const needle = normalizeText(rawQuery).trim()
    if (needle) index = haystack.indexOf(needle)
  }
  if (index < 0) index = 0
  const start = Math.max(0, index - Math.floor(limit * 0.35))
  const end = Math.min(text.length, start + limit)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

function parseTime(value) {
  const time = Date.parse(String(value ?? ''))
  return Number.isFinite(time) ? time : 0
}

function clamp(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return min
  return Math.min(max, Math.max(min, Math.trunc(number)))
}
