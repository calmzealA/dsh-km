import path from 'node:path'

const ID_PATTERN = /^km-[0-9a-f]{8}$/
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const ILLEGAL = /[\u0000-\u001f<>:"/\\|?*]/

export function isNoteId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value.trim())
}

export function normalizeId(value) {
  if (typeof value !== 'string') return null
  const id = value.trim().toLowerCase()
  return ID_PATTERN.test(id) ? id : null
}

export function newId() {
  const bytes = new Uint8Array(4)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return 'km-' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function slugify(title) {
  const text = String(title ?? '').normalize('NFKC')
  let out = ''
  for (const ch of text) {
    if (ILLEGAL.test(ch)) continue
    if (/\s/.test(ch)) {
      if (out && !out.endsWith('-')) out += '-'
      continue
    }
    out += ch
  }
  out = out.replace(/-+/g, '-').replace(/^[.\- ]+|[.\- ]+$/g, '')
  out = Array.from(out).slice(0, 40).join('')
  if (!out) out = 'note'
  if (RESERVED.test(out)) out += '-note'
  return out
}

export function isInside(parent, child) {
  const from = path.resolve(parent)
  const to = path.resolve(child)
  let relative = path.relative(from, to)
  if (process.platform === 'win32') {
    relative = path.relative(from.toLowerCase(), to.toLowerCase())
  }
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function resolveVaultRoot(workspaceDir, configured) {
  const workspace = path.resolve(String(workspaceDir))
  const raw = configured === undefined || configured === null ? '' : String(configured).trim()
  const root = raw ? path.resolve(workspace, raw) : path.join(workspace, '.dsh-km')
  if (!isInside(workspace, root)) {
    throw new Error('vaultDir must be a subdirectory of the workspace')
  }
  return root
}

export function noteFilePath(vaultRoot, id, title) {
  return path.join(vaultRoot, 'notes', `${slugify(title)}-${id}.md`)
}

export function compactStamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0')
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  )
}

export function trashFilePath(vaultRoot, id, title, date = new Date()) {
  return path.join(vaultRoot, '.trash', `${compactStamp(date)}-${slugify(title)}-${id}.md`)
}

export function toPosix(value) {
  return String(value).split(path.sep).join('/')
}

export function relativeTo(parent, target) {
  return toPosix(path.relative(parent, target))
}
