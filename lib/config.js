import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const DEFAULTS = Object.freeze({
  vaultDir: '',
  maxNoteBytes: 1048576,
  searchTopK: 8,
  maxResultChars: 6000,
  autoCreate: true,
  watch: true,
})

export const SETTINGS_KEYS = ['autoCreate', 'watch', 'searchTopK', 'maxNoteBytes', 'maxResultChars']

export function dshHome() {
  const configured = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  return configured || path.join(os.homedir(), '.dsh')
}

export function settingsFilePath() {
  return path.join(dshHome(), 'dsh-km', 'settings.json')
}

function clampInt(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

function positiveInt(value, fallback, min, max) {
  return clampInt(value, fallback, min, max)
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

export function normalizeConfig(raw, base = DEFAULTS) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const out = { ...base }
  if (typeof source.vaultDir === 'string') out.vaultDir = source.vaultDir.trim()
  out.maxNoteBytes = positiveInt(source.maxNoteBytes, out.maxNoteBytes, 4096, 16 * 1024 * 1024)
  out.searchTopK = positiveInt(source.searchTopK, out.searchTopK, 1, 50)
  out.maxResultChars = positiveInt(source.maxResultChars, out.maxResultChars, 500, 40000)
  out.autoCreate = bool(source.autoCreate, out.autoCreate)
  out.watch = bool(source.watch, out.watch)
  return out
}

export function normalizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const out = {}
  if (typeof source.autoCreate === 'boolean') out.autoCreate = source.autoCreate
  if (typeof source.watch === 'boolean') out.watch = source.watch
  if (source.searchTopK !== undefined) {
    out.searchTopK = clampInt(source.searchTopK, DEFAULTS.searchTopK, 1, 50)
  }
  if (source.maxNoteBytes !== undefined) {
    out.maxNoteBytes = clampInt(source.maxNoteBytes, DEFAULTS.maxNoteBytes, 4096, 16 * 1024 * 1024)
  }
  if (source.maxResultChars !== undefined) {
    out.maxResultChars = clampInt(source.maxResultChars, DEFAULTS.maxResultChars, 500, 40000)
  }
  return out
}

export async function readSettings() {
  try {
    const text = await fs.readFile(settingsFilePath(), 'utf8')
    return normalizeSettings(JSON.parse(text))
  } catch (error) {
    if (error && error.code === 'ENOENT') return {}
    return {}
  }
}

export async function writeSettings(patch) {
  const current = await readSettings()
  const next = { ...current, ...normalizeSettings(patch) }
  const file = settingsFilePath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8')
  try {
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
  return next
}

/**
 * Precedence: explicit plugin-row config (cordis.patch.yml) > settings.json >
 * built-in defaults. Only keys actually present in the row win, so shipping
 * an empty config keeps the Settings page useful.
 */
export async function loadEffectiveConfig(rowConfig) {
  const settings = await readSettings()
  const merged = { ...settings, ...normalizeRowOverrides(rowConfig) }
  return normalizeConfig(merged)
}

function normalizeRowOverrides(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  if (typeof raw.vaultDir === 'string' && raw.vaultDir.trim()) out.vaultDir = raw.vaultDir.trim()
  for (const key of SETTINGS_KEYS) {
    if (raw[key] !== undefined) out[key] = raw[key]
  }
  return out
}
