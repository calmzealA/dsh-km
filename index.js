/**
 * dsh-km — host half.
 *
 * Registers the four km_* tools, the /km command, and the same-origin HTTP API
 * the Web panel uses. Notes live as Markdown under <workspace>/.dsh-km; the
 * in-memory index is derived from those files on startup and after writes.
 */

import { registerCommands } from './lib/commands.js'
import { createRoutes } from './lib/routes.js'
import { registerTools } from './lib/tools.js'
import { VaultRegistry } from './lib/vaults.js'

export const inject = ['tools']

export function apply(ctx, config = {}) {
  const registry = new VaultRegistry({ ctx, rowConfig: config })

  registerTools(ctx, { registry })

  ctx.effect(() => () => registry.closeAll())

  ctx.inject(['commands'], scoped => {
    registerCommands(scoped, { registry })
  })

  ctx.inject(['webServer'], scoped => {
    const webServer = scoped.get('webServer') ?? scoped.webServer
    if (!webServer || typeof webServer.register !== 'function') return
    const routes = createRoutes({ registry, rowConfig: config })
    scoped.effect(() =>
      webServer.register({
        kind: 'prefix',
        path: routes.path,
        handler: routes.handle,
      }),
    )
  })
}
