/**
 * A deliberately small YAML frontmatter subset.
 *
 * Supported: `key: scalar`, inline sequences (`[a, b]`), inline mappings
 * (`{type: url, ref: "https://..."}`), and indented block sequences whose
 * items are scalars or inline mappings. That covers everything dsh-km writes
 * and the common hand-edited shapes, without a YAML dependency.
 */

export class FrontmatterError extends Error {
  constructor(message) {
    super(message)
    this.name = 'FrontmatterError'
  }
}

const KEY_LINE = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/
const LIST_LINE = /^[ \t]+-[ \t]*(.*)$/
const FLOW_KEYS = new Set(['sources', 'links', 'tags'])

export function parseFrontmatter(text) {
  const source = String(text ?? '')
  const withoutBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const lines = withoutBom.split(/\r?\n/)
  if (lines[0].trim() !== '---') {
    return { data: {}, body: withoutBom, hasFrontmatter: false }
  }
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
  }
  if (end === -1) throw new FrontmatterError('unterminated frontmatter block')

  const data = {}
  let pending = null
  const finishPending = () => {
    if (!pending) return
    if (pending.value.length === 0) {
      data[pending.key] = FLOW_KEYS.has(pending.key) ? [] : ''
    }
    pending = null
  }

  for (let i = 1; i < end; i++) {
    const raw = lines[i]
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const listMatch = LIST_LINE.exec(raw)
    if (listMatch) {
      if (!pending) throw new FrontmatterError(`line ${i + 1}: list item without an owning key`)
      pending.value.push(parseValue(listMatch[1]))
      continue
    }
    if (/^[ \t]/.test(raw)) {
      throw new FrontmatterError(`line ${i + 1}: unsupported indentation`)
    }
    const match = KEY_LINE.exec(raw)
    if (!match) throw new FrontmatterError(`line ${i + 1}: expected "key: value"`)
    finishPending()
    const key = match[1]
    const rest = match[2] === undefined ? '' : match[2].trim()
    if (rest === '') {
      const list = []
      data[key] = list
      pending = { key, value: list }
    } else {
      data[key] = parseValue(rest)
    }
  }
  finishPending()

  return {
    data,
    body: lines.slice(end + 1).join('\n').replace(/^\n/, ''),
    hasFrontmatter: true,
  }
}

function parseValue(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  if (value.startsWith('[') && value.endsWith(']')) return parseFlowSequence(value.slice(1, -1))
  if (value.startsWith('{') && value.endsWith('}')) return parseFlowMapping(value.slice(1, -1))
  return parseScalar(value)
}

function parseScalar(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value)
    } catch {
      throw new FrontmatterError(`invalid quoted string: ${value}`)
    }
  }
  if (value.startsWith("'")) {
    if (value.length < 2 || !value.endsWith("'")) {
      throw new FrontmatterError(`invalid single-quoted string: ${value}`)
    }
    return value.slice(1, -1).replace(/''/g, "'")
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '~') return null
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value)
  const comment = value.search(/\s#/)
  return (comment >= 0 ? value.slice(0, comment) : value).trim()
}

function splitTopLevel(input) {
  const parts = []
  let current = ''
  let depth = 0
  let quote = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      current += ch
      if (ch === quote && input[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '[' || ch === '{') {
      depth++
      current += ch
      continue
    }
    if (ch === ']' || ch === '}') {
      depth--
      current += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map(part => part.trim()).filter(Boolean)
}

function parseFlowSequence(input) {
  if (!input.trim()) return []
  return splitTopLevel(input).map(parseValue)
}

function parseFlowMapping(input) {
  const result = {}
  if (!input.trim()) return result
  for (const part of splitTopLevel(input)) {
    const index = topLevelColon(part)
    if (index < 0) throw new FrontmatterError(`invalid flow mapping entry: ${part}`)
    const key = part.slice(0, index).trim().replace(/^["']|["']$/g, '')
    result[key] = parseValue(part.slice(index + 1).trim())
  }
  return result
}

function topLevelColon(input) {
  let depth = 0
  let quote = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === quote && input[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '[' || ch === '{') {
      depth++
      continue
    }
    if (ch === ']' || ch === '}') {
      depth--
      continue
    }
    if (ch === ':' && depth === 0) return i
  }
  return -1
}

const FIELD_ORDER = ['id', 'title', 'tags', 'when', 'links', 'status', 'created', 'updated', 'sources']

export function serializeFrontmatter(data, body = '') {
  const lines = ['---']
  const known = new Set(FIELD_ORDER)
  for (const key of FIELD_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue
    const formatted = formatField(key, data[key])
    lines.push(formatted.startsWith('\n') ? `${key}:${formatted}` : `${key}: ${formatted}`)
  }
  for (const [key, value] of Object.entries(data)) {
    if (known.has(key)) continue
    if (value === undefined) continue
    const formatted = formatGeneric(value)
    lines.push(formatted.startsWith('\n') ? `${key}:${formatted}` : `${key}: ${formatted}`)
  }
  lines.push('---')
  return lines.join('\n') + '\n\n' + String(body ?? '').replace(/^\n+/, '')
}

function formatField(key, value) {
  if (key === 'tags' || key === 'links') return formatSequence(value)
  if (key === 'sources') return formatSources(value)
  return scalar(value)
}

function formatSequence(value) {
  if (!Array.isArray(value) || value.length === 0) return '[]'
  return `[${value.map(scalar).join(', ')}]`
}

function formatSources(value) {
  if (!Array.isArray(value) || value.length === 0) return '[]'
  return '\n' + value.map(item => `  - ${formatMapping(item)}`).join('\n')
}

function formatMapping(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return scalar(value)
  const entries = Object.entries(value).filter(([, item]) => item !== undefined)
  return `{${entries.map(([key, item]) => `${key}: ${scalar(item)}`).join(', ')}}`
}

function formatGeneric(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.every(item => item === null || typeof item !== 'object')) return formatSequence(value)
    return '\n' + value.map(item => `  - ${formatMapping(item)}`).join('\n')
  }
  if (value && typeof value === 'object') return formatMapping(value)
  return scalar(value)
}

function scalar(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = String(value)
  if (text === '') return '""'
  const needsQuote =
    /^\s|\s$/.test(text) ||
    /["'\\[\]{},#&*!|>%@`]/.test(text) ||
    text.includes(': ') ||
    text.endsWith(':') ||
    /^(true|false|null|~|-?\d+(?:\.\d+)?)$/i.test(text) ||
    /^[-?]/.test(text)
  return needsQuote ? JSON.stringify(text) : text
}
