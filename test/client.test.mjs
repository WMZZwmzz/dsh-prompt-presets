/**
 * Browser-bundle wiring test for @local/prompt-presets.
 * Loads client.js with a module-loader stub, then exercises the slot
 * registrations, the settings form wiring, and the injected preset submitter
 * without a DOM renderer.
 * Run with: node test/client.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DSH_BASICS_TEXT } from '../lib/model.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'client.js'), 'utf8')

const styleNodes = []
globalThis.document = {
  createElement(tag) {
    return {
      tag,
      attrs: {},
      textContent: '',
      setAttribute(name, value) { this.attrs[name] = value },
      remove() { this.removed = true },
    }
  },
  head: { append(node) { styleNodes.push(node) } },
}

let registration
const loadCalls = []
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      loadCalls.push(value)
      registration = value
    },
  },
}

// eslint-disable-next-line no-new-func -- evaluate the browser bundle in this scope
new Function(source)()

assert.equal(loadCalls.length, 1, 'client.js registers exactly one bundle')
assert.equal(registration.id, '@local/prompt-presets')
assert.ok(
  source.includes('const BASICS_TEXT = ' + JSON.stringify(DSH_BASICS_TEXT)),
  'the Settings preview text matches DSH_BASICS_TEXT in lib/model.js',
)
assert.ok(source.includes("'settings.mechanicsToggle'"), 'the Settings page exposes the runtime-mechanics toggle')
assert.ok(source.includes("path: ['keepDshMechanics']"), 'saving writes the runtime-mechanics option')

const reactStub = {
  createElement() { throw new Error('renderer not under test') },
  Fragment: 'Fragment',
  useId() { throw new Error('renderer not under test') },
  useState() { throw new Error('renderer not under test') },
  useEffect() { throw new Error('renderer not under test') },
  useLayoutEffect() { throw new Error('renderer not under test') },
  useRef() { throw new Error('renderer not under test') },
}
const reactDomStub = { createPortal() { throw new Error('renderer not under test') } }

const plugin = registration.factory((name) => {
  if (name === 'react') return reactStub
  if (name === 'react-dom') return reactDomStub
  throw new Error(`unexpected require ${name}`)
})

assert.deepEqual(plugin.inject, ['slots', 'locale', 'sessions', 'configForms'])
assert.equal(typeof plugin.apply, 'function')

const dictionaries = []
const slotInjects = []
const entries = []
const effects = []
const commands = []
let commandsResult = { ok: true, value: { matched: true } }
const sessions = {
  binding(sessionId) {
    if (sessionId !== 'session-1') return undefined
    return {
      session: {
        async command(line) {
          commands.push(line)
          return commandsResult
        },
      },
    }
  },
}

const formState = {
  status: 'ready',
  value: {
    presets: [
      { id: 'default', label: 'DSH 原有提示词', text: '' },
      { id: 'concise', label: '简洁', text: '回答保持简洁。' },
    ],
    defaultPreset: 'default',
  },
  revision: 3,
  writable: true,
  base: undefined,
  user: undefined,
}
const mutateCalls = []
const form = {
  getSnapshot: () => formState,
  subscribe: () => () => {},
  async mutate(ops, revision) {
    mutateCalls.push({ ops, revision })
    return true
  },
}
let servedNamespaces = null
const ctx = {
  effect(fn, label) {
    effects.push(label)
    const disposer = fn()
    return typeof disposer === 'function' ? disposer : () => {}
  },
  locale: {
    register(ns, dicts) {
      dictionaries.push({ ns, dicts })
      return () => {}
    },
    bind(ns) {
      const dict = dictionaries.find(entry => entry.ns === ns)?.dicts.zh ?? {}
      return (key, params) => {
        const template = dict[key] ?? key
        return params === undefined ? template : template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
      }
    },
  },
  slots: {
    inject(owner, callback) {
      slotInjects.push(owner)
      callback()
      return () => {}
    },
    register(options, component) {
      entries.push({ options, component })
      return () => {}
    },
  },
  configForms: {
    get(ns) {
      assert.equal(ns, 'prompt-presets')
      return form
    },
    whileServed(names, register) {
      servedNamespaces = names.slice()
      const off = register(new Set(names))
      return () => off()
    },
  },
  sessions,
}

plugin.apply(ctx)

assert.ok(effects.includes('prompt-presets: dictionaries'))
assert.equal(styleNodes.length, 1)
assert.equal(styleNodes[0].tag, 'style')
assert.ok('data-prompt-presets' in styleNodes[0].attrs)
assert.match(styleNodes[0].textContent, /\.dsh-pp-button \{[^}]*white-space: nowrap/, 'buttons never wrap their label')
assert.match(styleNodes[0].textContent, /\.dsh-pp-section-head \{[^}]*flex-wrap: wrap/, 'the add button can wrap below the heading')

assert.equal(dictionaries.length, 1)
assert.equal(dictionaries[0].ns, 'promptPresets')
assert.ok(dictionaries[0].dicts.zh && dictionaries[0].dicts.en, 'registers both baseline locales')
assert.ok(dictionaries[0].dicts.zh['settings.nav'], 'adds settings copy')
for (const key of ['settings.mechanicsTitle', 'settings.mechanicsDescription', 'settings.mechanicsToggle']) {
  assert.ok(dictionaries[0].dicts.zh[key], `adds Chinese ${key}`)
  assert.ok(dictionaries[0].dicts.en[key], `adds English ${key}`)
}

assert.deepEqual(servedNamespaces, ['prompt-presets'])
assert.deepEqual(slotInjects.sort(), ['conversation.input.left', 'settings.section', 'settings.section.icon'])

const chip = entries.find(entry => entry.options.name === 'conversation.input.left')
assert.ok(chip, 'chip entry registered')
assert.equal(chip.options.id, 'prompt-preset')
assert.equal(chip.options.locale, 'promptPresets')
assert.equal(typeof chip.component, 'function')
const chipInject = chip.options.inject('session-1')
assert.equal(typeof chipInject.select, 'function')
assert.equal(chipInject.hooks.presetForm.getSnapshot().status, 'ready')
assert.deepEqual(await chipInject.select('concise'), { ok: true })
assert.deepEqual(commands, ['/prompt-preset concise'])

commandsResult = { ok: true, value: { matched: false } }
assert.deepEqual(await chipInject.select('concise'), { ok: false, reason: 'unmatched' })
commandsResult = { ok: false, error: { code: 'gateway/offline' } }
assert.deepEqual(await chipInject.select('concise'), { ok: false, reason: 'gateway/offline' })
assert.deepEqual(await chip.options.inject('missing-session').select('concise'), { ok: false, reason: 'unavailable' })

const section = entries.find(entry => entry.options.name === 'settings.section')
assert.ok(section, 'settings.section entry registered')
assert.equal(section.options.id, 'prompt-presets')
assert.equal(section.options.order, 30)
assert.equal(section.options.locale, 'promptPresets')
assert.equal(section.options.label(), '系统提示词预设')
const sectionInject = section.options.inject()
assert.equal(sectionInject.hooks.presetForm, chipInject.hooks.presetForm)
const ops = [{ op: 'set', path: ['presets'], value: formState.value.presets }]
assert.equal(await sectionInject.save(ops, 3), true)
assert.deepEqual(mutateCalls, [{ ops, revision: 3 }])

const icon = entries.find(entry => entry.options.name === 'settings.section.icon')
assert.ok(icon, 'settings icon entry registered')
assert.equal(icon.options.id, 'prompt-presets')
assert.equal(typeof icon.component, 'function')

console.log('ok - client bundle registers the chip, settings section, and icon')
console.log('ok - the chip submits /prompt-preset <id> and folds failures')
console.log('ok - the Settings page saves through the shared Host form')
console.log('\n3/3 passed')
