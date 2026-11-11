import path from 'node:path'

export function registerCommands(ctx, { registry }) {
  const commands = ctx.get('commands')
  if (!commands) return

  const workspaceFor = async invocation => {
    const workingDirectory = ctx.get('workingDirectory')
    if (workingDirectory && invocation.agent) {
      return await workingDirectory.ensure(invocation.agent, invocation.signal)
    }
    if (workingDirectory && workingDirectory.defaultDirectory) return workingDirectory.defaultDirectory
    return process.cwd()
  }

  ctx.effect(() =>
    commands.register({
      name: 'km',
      description: 'Knowledge base: /km, /km add <text>, /km search <text>, /km open',
      input: { hint: '[add <text> | search <text> | open]' },
      async handler(invocation) {
        try {
          const raw = String(invocation.rawInput ?? '').trim()
          const [verb, ...rest] = raw.split(/\s+/)
          const text = raw.slice(verb ? verb.length : 0).trim()
          const workspace = await workspaceFor(invocation)
          if (!verb || verb === 'open' || verb === 'help') {
            return { kind: 'success', text: await summary(registry, workspace) }
          }
          if (verb === 'add') {
            if (!text) return { kind: 'error', text: 'Usage: /km add <text>' }
            const note = await addNote(registry, workspace, text)
            return {
              kind: 'success',
              text: `Saved ${note.id} (${note.status})\npath: ${note.path}\nReview it in the knowledge panel or with km_read.`,
            }
          }
          if (verb === 'search' || verb === 'find') {
            if (!text) return { kind: 'error', text: 'Usage: /km search <text>' }
            const vault = await registry.forWorkspace(workspace, { create: false })
            const config = await registry.config()
            const result = vault.search(text, { topK: Math.min(8, config.searchTopK) })
            if (!result.hits.length) return { kind: 'success', text: `No notes matched "${text}".` }
            return { kind: 'success', text: renderHits(result.hits) }
          }
          return { kind: 'error', text: 'Usage: /km [add <text> | search <text> | open]' }
        } catch (error) {
          return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
        }
      },
    }),
  )
}

async function summary(registry, workspace) {
  const vault = await registry.forWorkspace(workspace, { create: false })
  const stats = await vault.stats()
  const recent = (await vault.list()).slice(0, 5)
  const relative = path.relative(workspace, vault.root) || vault.root
  const lines = [
    `dsh-km · ${relative}`,
    `notes: ${stats.total} · verified ${stats.byStatus.verified ?? 0} · draft ${stats.byStatus.draft ?? 0} · stale ${stats.byStatus.stale ?? 0}`,
  ]
  if (stats.topTags.length) lines.push(`tags: ${stats.topTags.map(item => `${item.tag} (${item.count})`).join(', ')}`)
  if (recent.length) {
    lines.push('recent:')
    for (const note of recent) lines.push(`- ${note.id} ${note.title} (${note.status})`)
  }
  if (stats.errors.length) lines.push(`parse warnings: ${stats.errors.length} (see the knowledge panel)`)
  lines.push('Open the knowledge panel from the sidebar footer, or use km_search/km_read.')
  return lines.join('\n')
}

async function addNote(registry, workspace, text) {
  const vault = await registry.forWorkspace(workspace, { create: true })
  const firstLine = text.split(/\r?\n/).find(line => line.trim()) ?? text
  const title = Array.from(firstLine.trim()).slice(0, 60).join('')
  return await vault.write({
    title,
    body: text,
    status: 'verified',
    sources: [{ type: 'manual', ref: '/km add', capturedAt: new Date().toISOString() }],
  })
}

function renderHits(hits) {
  const lines = []
  for (const [index, hit] of hits.entries()) {
    lines.push(`[${index + 1}] ${hit.id} · ${hit.title} · ${hit.status}`)
    if (hit.when) lines.push(`    when: ${hit.when}`)
    if (hit.snippet) lines.push(`    ${hit.snippet}`)
  }
  return lines.join('\n')
}
