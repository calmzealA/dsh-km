import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const source = await fsp.readFile(path.join(here, '..', 'client.js'), 'utf8')

test('loads as a Web client module and registers three slots', () => {
  let loaded = null
  const sandbox = {
    window: { __ModuleLoader__: { load(module) { loaded = module } } },
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch: async () => {
      throw new Error('not called in this test')
    },
    navigator: { clipboard: { writeText: async () => {} } },
    localStorage: { getItem: () => null, setItem: () => {} },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)

  assert.ok(loaded, 'the module loader received a definition')
  assert.equal(loaded.id, 'dsh-km')
  assert.equal(typeof loaded.factory, 'function')

  const React = {
    createElement: () => ({}),
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useMemo: () => null,
    useRef: () => ({ current: 0 }),
    useCallback: fn => fn,
  }
  const module = loaded.factory(name => {
    if (name === 'react') return React
    throw new Error('unexpected require: ' + name)
  })
  assert.ok(module.inject.includes('slots'))
  assert.ok(module.inject.includes('locale'))

  const slots = []
  const ctx = {
    effect(fn) {
      const dispose = fn()
      return dispose ?? (() => {})
    },
    get() {
      return undefined
    },
    locale: {
      bind: () => key => key,
      register: () => () => {},
    },
    slots: {
      inject(key, callback) {
        slots.push(key)
        return callback()
      },
      register(options) {
        slots.push(options.name + ':' + (options.id ?? options.key))
        return () => {}
      },
    },
  }
  module.apply(ctx)
  assert.ok(slots.includes('sidebar.footer.action'))
  assert.ok(slots.includes('main:dsh-km'))
  assert.ok(slots.includes('settings.section:dsh-km'))
})
