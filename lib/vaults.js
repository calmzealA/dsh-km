import fsp from 'node:fs/promises'
import path from 'node:path'

import { loadEffectiveConfig } from './config.js'
import { resolveVaultRoot } from './paths.js'
import { Vault } from './vault.js'

export class VaultRegistry {
  constructor({ ctx, rowConfig }) {
    this.ctx = ctx
    this.rowConfig = rowConfig ?? {}
    this.vaults = new Map()
  }

  async config() {
    return loadEffectiveConfig(this.rowConfig)
  }

  key(value) {
    const resolved = path.resolve(value)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }

  async forWorkspace(workspaceDir, options = {}) {
    const config = await this.config()
    const root = resolveVaultRoot(workspaceDir, config.vaultDir)
    const key = this.key(root)
    let vault = this.vaults.get(key)
    if (!vault) {
      vault = new Vault({ root, maxNoteBytes: config.maxNoteBytes, watch: config.watch })
      this.vaults.set(key, vault)
    }
    const create = options.create === undefined ? config.autoCreate : options.create
    await vault.init({ create })
    return vault
  }

  knownWorkspaces() {
    const entries = []
    const registry = safeGet(this.ctx, 'workspaceRegistry')
    if (registry && typeof registry.list === 'function') {
      for (const workspace of registry.list()) {
        if (!workspace || typeof workspace.path !== 'string') continue
        entries.push({ id: workspace.id, title: workspace.title, path: workspace.path })
      }
    }
    const workingDirectory = safeGet(this.ctx, 'workingDirectory')
    if (workingDirectory && typeof workingDirectory.defaultDirectory === 'string' && workingDirectory.defaultDirectory) {
      entries.push({ id: undefined, title: path.basename(workingDirectory.defaultDirectory), path: workingDirectory.defaultDirectory })
    }
    const seen = new Set()
    const out = []
    for (const entry of entries) {
      const key = this.key(entry.path)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(entry)
    }
    return out
  }

  async isKnownWorkspace(value) {
    if (typeof value !== 'string' || !value.trim()) return false
    const key = this.key(value)
    return this.knownWorkspaces().some(entry => this.key(entry.path) === key)
  }

  async summary() {
    const config = await this.config()
    const result = []
    for (const workspace of this.knownWorkspaces()) {
      let vaultPath = ''
      let exists = false
      let counts = null
      try {
        vaultPath = resolveVaultRoot(workspace.path, config.vaultDir)
        const stat = await fsp.stat(vaultPath)
        exists = stat.isDirectory()
      } catch {
        exists = false
      }
      if (exists) {
        try {
          const vault = await this.forWorkspace(workspace.path, { create: false })
          const stats = await vault.stats()
          counts = { total: stats.total, byStatus: stats.byStatus }
          vaultPath = vault.root
        } catch {
          counts = null
        }
      }
      result.push({
        title: workspace.title || path.basename(workspace.path),
        path: workspace.path,
        vault: vaultPath,
        exists,
        counts,
      })
    }
    return result
  }

  closeAll() {
    for (const vault of this.vaults.values()) vault.close()
    this.vaults.clear()
  }
}

function safeGet(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}
