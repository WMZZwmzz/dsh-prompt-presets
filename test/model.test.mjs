/**
 * Pure-logic and Host-wiring tests for @local/prompt-presets.
 * Run with: node test/model.test.mjs
 */
import assert from 'node:assert/strict'
import {
  BUILTIN_PRESET_LABEL,
  COMMAND_NAME,
  DSH_BASICS_TEXT,
  KEEP_DSH_BASICS_DEFAULT,
  KEEP_DSH_MECHANICS_DEFAULT,
  PRESET_SECTION_NAME,
  PROJECTION_KEY,
  STATE_VERSION,
  buildPromptSections,
  commandAction,
  completePromptText,
  createStateSchema,
  createViewSchema,
  effectivePresetId,
  foldEvent,
  initialState,
  isReplacedSection,
  normalizeConfig,
  unwrapVolatile,
  viewOf,
} from '../lib/model.js'
import { Config, apply, inject } from '../index.js'

const tests = []
function test(name, body) {
  tests.push({ name, body })
}

function configOf(overrides) {
  return normalizeConfig({
    defaultPreset: 'default',
    presets: [
      { id: 'default', label: 'Default', text: '' },
      { id: 'concise', label: 'Concise', text: 'Keep answers short.' },
    ],
    ...overrides,
  })
}

function createStubContext(overrides = {}) {
  const captured = {}
  const warnings = []
  const effects = []
  const state = overrides.state ?? { current: 'default', pending: null }
  const handle = {
    stateOf: () => {
      if (captured.throwing === true) throw new Error('boom')
      return state
    },
    async dispose() {},
  }
  const ctx = {
    logger: { info() {}, warn: message => { warnings.push(message) } },
    fiber: {},
    on(event, listener, options) {
      captured.on = { event, listener, options }
      return () => {}
    },
    inject(deps, callback) {
      captured.injectDeps = deps
      callback({
        effect: fn => { fn(); return () => {} },
        settings: {
          configure() { captured.configured = (captured.configured ?? 0) + 1; return () => {} },
          describe() { captured.described = (captured.described ?? 0) + 1; return [] },
        },
      })
    },
    sessionProjections: {
      register(definition) {
        captured.definition = definition
        return Promise.resolve(handle)
      },
    },
    commands: { register(definition) { captured.command = definition } },
  }
  return { ctx, captured, warnings, effects, state }
}

test('inject covers the three required Host services', () => {
  assert.deepEqual(inject, ['systemPrompt', 'commands', 'sessionProjections'])
})

test('Config: defaults, volatile refs, and schema validation', () => {
  const resolved = Config({ presets: [{ id: 'default', label: 'DSH 原有提示词' }], defaultPreset: 'default' })
  assert.equal(typeof resolved.presets.get, 'function')
  assert.equal(typeof resolved.defaultPreset.get, 'function')
  assert.deepEqual(unwrapVolatile(resolved.presets), [
    { id: 'default', label: 'DSH 原有提示词', text: '' },
  ])
  assert.equal(unwrapVolatile(resolved.defaultPreset), 'default')

  const empty = Config({})
  assert.deepEqual(unwrapVolatile(empty.presets), [{ id: 'default', label: BUILTIN_PRESET_LABEL, text: '' }])
  assert.equal(unwrapVolatile(empty.defaultPreset), 'default')
  assert.equal(unwrapVolatile(empty.keepDshBasics), true)
  assert.equal(unwrapVolatile(empty.keepDshMechanics), true)
  assert.equal(unwrapVolatile(Config({ keepDshBasics: false }).keepDshBasics), false)
  assert.equal(unwrapVolatile(Config({ keepDshMechanics: false }).keepDshMechanics), false)
  assert.equal(KEEP_DSH_BASICS_DEFAULT, true)
  assert.equal(KEEP_DSH_MECHANICS_DEFAULT, true)

  assert.throws(() => Config({ presets: [{ id: 'Bad Id', label: 'x' }] }))
  assert.throws(() => Config({ presets: [{ id: 'ok' }] }))
  assert.throws(() => Config({ keepDshBasics: 'yes' }))
  assert.throws(() => Config({ keepDshMechanics: 'yes' }))
})

test('config: falls back to a single default preset', () => {
  const cfg = normalizeConfig(undefined)
  assert.equal(cfg.presets.length, 1)
  assert.equal(cfg.defaultPreset, 'default')
  assert.equal(cfg.presets[0].text, '')
  assert.equal(cfg.keepDshBasics, true)
  assert.equal(cfg.keepDshMechanics, true)
})

test('config: valid presets and derived maps', () => {
  const cfg = configOf()
  assert.equal(cfg.presets.length, 2)
  assert.equal(cfg.byId.get('concise').text, 'Keep answers short.')
  assert.equal(cfg.keepDshBasics, true)
  assert.equal(cfg.keepDshMechanics, true)
  assert.equal(configOf({ keepDshBasics: false }).keepDshBasics, false)
  assert.equal(configOf({ keepDshMechanics: false }).keepDshMechanics, false)
  assert.deepEqual(cfg.views, [{ id: 'default', label: 'Default' }, { id: 'concise', label: 'Concise' }])
})

test('config: rejects malformed input', () => {
  const bad = [
    { presets: [] },
    { presets: [{ id: 'Bad Id', label: 'x' }] },
    { presets: [{ id: 'a', label: 'x' }, { id: 'a', label: 'y' }] },
    { presets: [{ id: 'a', label: '  ' }] },
    { presets: [{ id: 'a', label: 'x', text: 1 }] },
    { presets: [{ id: 'a', label: 'x', text: '  ' }] },
    { presets: [{ id: 'a', label: 'x', text: '' }] },
    { presets: [{ id: 'a', label: 'x' }], defaultPreset: 'missing' },
    { presets: [{ id: 'a', label: 'x', text: 't' }], keepDshBasics: 'yes' },
    { presets: [{ id: 'a', label: 'x', text: 't' }], keepDshMechanics: 'yes' },
  ]
  for (const value of bad) assert.throws(() => normalizeConfig(value), TypeError)
})

test('helpers: volatile unwrapping and effective ids', () => {
  assert.equal(unwrapVolatile('x'), 'x')
  assert.equal(unwrapVolatile({ get: () => 'y' }), 'y')
  const cfg = configOf()
  assert.equal(effectivePresetId(cfg, 'concise'), 'concise')
  assert.equal(effectivePresetId(cfg, 'gone'), 'default')
})

test('fold: ignores unrelated events by reference', () => {
  const cfg = configOf()
  const state = initialState(cfg)
  for (const event of [
    undefined,
    { type: 'turn/start', data: {} },
    { type: 'command/run', data: { name: 'other', args: 'concise', commandId: 'c1' } },
    { type: 'command/run', data: { name: COMMAND_NAME, args: '', commandId: 'c2' } },
    { type: 'command/done', data: { commandId: 'c9', kind: 'success' } },
  ]) {
    assert.equal(foldEvent(cfg, state, event), state)
  }
})

test('fold: a successful paired command switches the preset', () => {
  const cfg = configOf()
  let state = initialState(cfg)
  state = foldEvent(cfg, state, { type: 'command/run', data: { name: COMMAND_NAME, args: ' concise ', commandId: 'c1' } })
  assert.deepEqual(state.pending, { id: 'concise', commandId: 'c1' })
  state = foldEvent(cfg, state, { type: 'command/done', data: { commandId: 'c1', kind: 'success' } })
  assert.deepEqual(state, { current: 'concise', pending: null })
  assert.equal(completePromptText(cfg, state), DSH_BASICS_TEXT + '\n\nKeep answers short.')
})

test('prompt text: passthrough, basics on by default, exact replacement when off', () => {
  const on = configOf()
  const off = configOf({ keepDshBasics: false })
  assert.equal(completePromptText(on, { current: 'default' }), undefined)
  assert.equal(completePromptText(on, { current: 'concise' }), DSH_BASICS_TEXT + '\n\nKeep answers short.')
  assert.equal(completePromptText(off, { current: 'concise' }), 'Keep answers short.')
  assert.equal(completePromptText(on, null), undefined)
})

test('prompt sections: replace identity/persona and preserve DSH mechanics by default', () => {
  const assembled = [
    { name: 'harness:identity', text: 'You are DSH.', interpolate: false },
    { name: 'deployment:persona-prefix', text: 'You are a coding agent.' },
    { name: 'plan:policy', text: 'Stay in plan mode.' },
    { name: 'tool:read', text: 'Use read.' },
    { name: 'tools:sdk', text: 'declare tools' },
    { name: 'ui:deliverable-file-references', text: 'link files' },
    { name: 'plugin:prompt-preset', text: 'stale preset section' },
  ]
  const on = configOf()
  const off = configOf({ keepDshMechanics: false })

  assert.equal(isReplacedSection('harness:identity'), true)
  assert.equal(isReplacedSection('deployment:persona-prefix'), true)
  assert.equal(isReplacedSection('deployment:persona-suffix'), true)
  assert.equal(isReplacedSection('deployment:persona-extra'), true)
  assert.equal(isReplacedSection('persona'), true)
  assert.equal(isReplacedSection('plan:policy'), false)
  assert.equal(isReplacedSection('tool:read'), false)
  assert.equal(isReplacedSection(null), false)

  assert.equal(buildPromptSections(on, { current: 'default' }, assembled), undefined)

  const kept = buildPromptSections(on, { current: 'concise' }, assembled)
  assert.deepEqual(kept.map(section => section.name), [
    PRESET_SECTION_NAME,
    'plan:policy',
    'tool:read',
    'tools:sdk',
    'ui:deliverable-file-references',
  ])
  assert.deepEqual(kept[0], {
    name: PRESET_SECTION_NAME,
    text: DSH_BASICS_TEXT + '\n\nKeep answers short.',
    interpolate: false,
  })
  assert.deepEqual(kept[1], { name: 'plan:policy', text: 'Stay in plan mode.' })

  const exact = buildPromptSections(off, { current: 'concise' }, assembled)
  assert.deepEqual(exact.map(section => section.name), [PRESET_SECTION_NAME])

  const noBasics = buildPromptSections(configOf({ keepDshBasics: false }), { current: 'concise' }, assembled)
  assert.equal(noBasics[0].text, 'Keep answers short.')

  // The helper tolerates a malformed section list without crashing assembly.
  assert.deepEqual(buildPromptSections(on, { current: 'concise' }, undefined).map(section => section.name), [PRESET_SECTION_NAME])
})

test('fold: an errored command keeps the previous preset', () => {
  const cfg = configOf()
  let state = initialState(cfg)
  state = foldEvent(cfg, state, { type: 'command/run', data: { name: COMMAND_NAME, args: 'concise', commandId: 'c1' } })
  state = foldEvent(cfg, state, { type: 'command/done', data: { commandId: 'c1', kind: 'error', text: 'nope' } })
  assert.deepEqual(state, { current: 'default', pending: null })
})

test('fold: a removed preset falls back to the default', () => {
  const cfg = configOf()
  let state = initialState(cfg)
  state = foldEvent(cfg, state, { type: 'command/run', data: { name: COMMAND_NAME, args: 'gone', commandId: 'c1' } })
  state = foldEvent(cfg, state, { type: 'command/done', data: { commandId: 'c1', kind: 'success' } })
  assert.equal(state.current, 'default')
})

test('view: unknown stored ids fall back and mark the missing preset', () => {
  const cfg = configOf()
  const a = viewOf(cfg, { current: 'gone', pending: null })
  const b = viewOf(cfg, { current: 'default', pending: null })
  assert.equal(a.current, 'default')
  assert.equal(a.missing, true)
  assert.equal(b.missing, false)
  assert.equal(a.presets, b.presets)
  assert.equal(Object.isFrozen(a.presets), true)
})

test('schemas: accept real values and keep unknown ids stored', () => {
  const stateSchema = createStateSchema()
  assert.deepEqual(stateSchema.parse({ current: 'gone', pending: null }), { current: 'gone', pending: null })
  assert.deepEqual(
    stateSchema.parse({ current: 'concise', pending: { id: 'concise', commandId: 'c1' } }),
    { current: 'concise', pending: { id: 'concise', commandId: 'c1' } },
  )
  assert.throws(() => stateSchema.parse({ current: 1, pending: null }), TypeError)
  const cfg = configOf()
  const viewSchema = createViewSchema()
  const view = viewOf(cfg, initialState(cfg))
  assert.equal(viewSchema.parse(view), view)
  assert.throws(() => viewSchema.parse({ current: 'nope', presets: [] }), TypeError)
})

test('command: list, unknown, and known results', () => {
  const cfg = configOf()
  assert.deepEqual(commandAction(cfg, '  '), { kind: 'success', text: 'prompt presets: default, concise' })
  assert.equal(commandAction(cfg, 'nope').kind, 'error')
  assert.deepEqual(commandAction(cfg, 'concise'), { kind: 'success', text: 'Concise' })
})

test('apply: wires the projection, command, prompt replacement, and settings policy', async () => {
  const liveConfig = {
    presets: [
      { id: 'default', label: 'Default', text: '' },
      { id: 'concise', label: 'Concise', text: 'Keep answers short.' },
    ],
    defaultPreset: 'default',
    keepDshBasics: true,
  }
  const { ctx, captured, warnings, state } = createStubContext()
  await apply(ctx, liveConfig)

  assert.deepEqual(captured.injectDeps, ['settings'])
  assert.equal(captured.configured, 1)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(captured.described, 1)
  assert.equal(captured.definition.key, PROJECTION_KEY)
  assert.equal(captured.definition.stateVersion, STATE_VERSION)
  assert.equal(captured.definition.wire.summary, false)
  assert.equal(captured.command.name, COMMAND_NAME)
  assert.equal(captured.command.input.hint, '<preset-id>')
  assert.equal(captured.on.event, 'system-prompt/assemble')
  assert.deepEqual(captured.on.options, { prepend: true })

  const next = captured.definition.apply(
    captured.definition.init(),
    { type: 'command/run', data: { name: COMMAND_NAME, args: 'concise', commandId: 'c1' } },
  )
  const settled = captured.definition.apply(
    next,
    { type: 'command/done', data: { commandId: 'c1', kind: 'success' } },
  )
  assert.deepEqual(settled, { current: 'concise', pending: null })
  assert.deepEqual(captured.definition.wire.view(settled), {
    current: 'concise',
    presets: [{ id: 'default', label: 'Default' }, { id: 'concise', label: 'Concise' }],
    missing: false,
  })

  const dshSections = () => [
    { name: 'harness:identity', text: 'DSH prompt', interpolate: false },
    { name: 'deployment:persona-prefix', text: 'You are a coding agent.' },
    { name: 'tool:read', text: 'Use read.' },
    { name: 'plan:policy', text: 'Plan rules.' },
  ]
  const presentation = () => ({
    sections: dshSections(),
    contexts: [{ name: 'working-directory:current', text: '/repo' }],
    variables: { model: 'm' },
  })
  const passage = async () => presentation()
  const assemble = session => captured.on.listener({}, { agent: { session } }, passage)
  const dshPrompt = { sections: dshSections() }
  const keptSectionNames = [PRESET_SECTION_NAME, 'tool:read', 'plan:policy']

  // The built-in preset is a passthrough; the assembly comes back untouched.
  state.current = 'default'
  assert.deepEqual((await assemble({ header: {} })).sections, dshPrompt.sections)

  // A custom preset replaces identity/persona, keeps DSH mechanics, and keeps contexts/tools.
  state.current = 'concise'
  const replaced = await assemble({ header: {} })
  assert.deepEqual(replaced.sections, [
    { name: 'plugin:prompt-preset', text: DSH_BASICS_TEXT + '\n\nKeep answers short.', interpolate: false },
    { name: 'tool:read', text: 'Use read.' },
    { name: 'plan:policy', text: 'Plan rules.' },
  ])
  assert.deepEqual(replaced.sections.map(section => section.name), keptSectionNames)
  assert.deepEqual(replaced.contexts, [{ name: 'working-directory:current', text: '/repo' }])
  assert.deepEqual(replaced.variables, { model: 'm' })

  // Turning the basics option off keeps the exact preset text but still keeps mechanics.
  liveConfig.keepDshBasics = false
  assert.deepEqual((await assemble({ header: {} })).sections, [
    { name: 'plugin:prompt-preset', text: 'Keep answers short.', interpolate: false },
    { name: 'tool:read', text: 'Use read.' },
    { name: 'plan:policy', text: 'Plan rules.' },
  ])
  liveConfig.keepDshBasics = true

  // Turning mechanics off restores the complete replacement.
  liveConfig.keepDshMechanics = false
  assert.deepEqual((await assemble({ header: {} })).sections, [
    { name: 'plugin:prompt-preset', text: DSH_BASICS_TEXT + '\n\nKeep answers short.', interpolate: false },
  ])
  liveConfig.keepDshMechanics = true
  assert.deepEqual((await assemble({ header: {} })).sections.map(section => section.name), keptSectionNames)

  // Subagent sessions keep their own prompt, and diagnostics have no agent.
  assert.deepEqual((await assemble({ header: { origin: 'subagent' } })).sections, dshPrompt.sections)
  assert.deepEqual((await captured.on.listener({}, {}, passage)).sections, dshPrompt.sections)

  // A live settings edit reaches the replacement and the command without re-applying.
  liveConfig.presets = [
    { id: 'default', label: 'DSH original', text: '' },
    { id: 'detailed', label: 'Detailed', text: 'Explain every step.' },
  ]
  liveConfig.defaultPreset = 'detailed'
  state.current = 'detailed'
  assert.deepEqual((await assemble({ header: {} })).sections.map(section => section.name), keptSectionNames)
  assert.equal((await assemble({ header: {} })).sections[0].text, DSH_BASICS_TEXT + '\n\nExplain every step.')
  assert.deepEqual(captured.command.handler({ rawInput: 'detailed' }), { kind: 'success', text: 'Detailed' })
  assert.equal(captured.command.handler({ rawInput: 'concise' }).kind, 'error')
  assert.equal(captured.definition.wire.view({ current: 'gone', pending: null }).current, 'detailed')

  // A projection read failure never breaks assembly, and warns once.
  captured.throwing = true
  assert.deepEqual((await assemble({ header: {} })).sections, dshPrompt.sections)
  assert.deepEqual((await assemble({ header: {} })).sections, dshPrompt.sections)
  assert.equal(warnings.length, 1)
  captured.throwing = false
})

test('apply: rejects an invalid boot config before registering anything', async () => {
  const { ctx } = createStubContext()
  await assert.rejects(() => apply(ctx, { presets: [] }), TypeError)
})

let failed = 0
for (const { name, body } of tests) {
  try {
    await body()
    console.log(`ok - ${name}`)
  } catch (error) {
    failed += 1
    console.error(`not ok - ${name}`)
    console.error(error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
if (failed > 0) process.exitCode = 1
