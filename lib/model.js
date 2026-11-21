/**
 * Pure model for the prompt-presets plugin: configuration normalization, the
 * `promptPreset` session-projection fold, its client view, the complete-prompt
 * text lookup, and command results.
 *
 * The plugin's Config marks `presets` and `defaultPreset` volatile, so the
 * running plugin reads them through `Volatile.get()` refs. `unwrapVolatile()`
 * keeps this module usable with both the live refs and plain JSON (tests,
 * fallbacks).
 *
 * A custom preset's text replaces DSH's persona/identity sections. By default
 * DSH's remaining operating sections (plan mode, PTC, tool guidance, web
 * safety, file references, MCP instructions) are kept alongside it; turning
 * `keepDshMechanics` off makes the preset text the complete system prompt.
 * Only the reserved built-in `default` preset is a passthrough that leaves
 * DSH's own prompt untouched.
 *
 * @module prompt-presets/model
 */

/** Session-projection key owned by this plugin. */
export const PROJECTION_KEY = 'promptPreset'

/** Persisted projection state version; bump when the fold changes shape. */
export const STATE_VERSION = 1

/** Host command that switches the current session's preset (keep the client in sync). */
export const COMMAND_NAME = 'prompt-preset'

/** Preset ids double as command arguments, so keep them argument-safe. */
export const PRESET_ID_PATTERN = /^[a-z][a-z0-9_-]*$/

/** Label of the reserved built-in preset: the original DSH system prompt, no extra text. */
export const BUILTIN_PRESET_LABEL = 'DSH 原有提示词'

/** Reserved id of the built-in preset that adds nothing to DSH's own prompt. */
export const BUILTIN_PRESET_ID = 'default'

/**
 * Short harness preamble optionally prepended to every custom preset: identity,
 * tool guidance, and a pointer to the runtime environment. Keep in sync with
 * the preview literal in client.js (`BASICS_TEXT`).
 */
export const DSH_BASICS_TEXT = [
  'You are an AI agent powered by DeepSeek Harness. You interact with the user through the DeepSeek Harness Web GUI.',
  "Use the tools available in this conversation when they help, and follow each tool's input schema.",
  'The current working directory and other environment details are provided in the conversation context.',
].join('\n')

/** Default for whether a custom preset keeps the short DSH preamble. */
export const KEEP_DSH_BASICS_DEFAULT = true

/**
 * Default for whether a custom preset keeps DSH's non-persona operating
 * sections: plan mode, PTC, tool guidance, web safety, file references,
 * MCP instructions, and other first-party mechanics.
 */
export const KEEP_DSH_MECHANICS_DEFAULT = true

/** Name of the one section this plugin contributes to the assembly. */
export const PRESET_SECTION_NAME = 'plugin:prompt-preset'

/**
 * Sections a custom preset replaces: DSH's harness identity and the
 * deployment persona. Everything else is an operating mechanic and survives
 * when `keepDshMechanics` is on, including sections added by future plugins.
 */
const REPLACED_SECTION_NAMES = new Set([
  'harness:identity',
  'deployment:persona-prefix',
  'deployment:persona-suffix',
  PRESET_SECTION_NAME,
])

/**
 * Whether a custom preset replaces a section instead of preserving it.
 * `deployment:persona-*` covers preset-specific persona slots.
 * @param name - assembled section name.
 * @returns true when the section belongs to DSH's identity/persona.
 */
export function isReplacedSection(name) {
  return typeof name === 'string'
    && (REPLACED_SECTION_NAMES.has(name) || name.startsWith('deployment:persona'))
}

/** Fresh code fallback used when the row config omits or invalidates `presets`. */
export function defaultPresets() {
  return [{ id: BUILTIN_PRESET_ID, label: BUILTIN_PRESET_LABEL, text: '' }]
}

/**
 * Read a plain value out of a Loader `Volatile` ref or a plain JSON value.
 * @param value - volatile ref or plain value.
 * @returns the current plain value.
 */
export function unwrapVolatile(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') return value.get()
  return value
}

/**
 * Validate the row config and derive the lookup tables the fold needs.
 * @param config - raw `config` object from the Loader row (or a plain object),
 *   or undefined.
 * @returns Frozen normalized configuration.
 */
export function normalizeConfig(config) {
  const source = config === undefined || config === null ? {} : config
  if (typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('prompt-presets: config must be an object')
  }
  const rawPresets = source.presets === undefined ? defaultPresets() : source.presets
  if (!Array.isArray(rawPresets) || rawPresets.length === 0) {
    throw new TypeError('prompt-presets: config.presets must be a non-empty list')
  }
  const presets = []
  const seen = new Set()
  for (const [index, raw] of rawPresets.entries()) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new TypeError(`prompt-presets: presets[${index}] must be an object`)
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!PRESET_ID_PATTERN.test(id)) {
      throw new TypeError(`prompt-presets: presets[${index}].id must match ${String(PRESET_ID_PATTERN)} (got ${JSON.stringify(raw.id)})`)
    }
    if (seen.has(id)) throw new TypeError(`prompt-presets: duplicate preset id ${JSON.stringify(id)}`)
    seen.add(id)
    const label = typeof raw.label === 'string' ? raw.label.trim() : ''
    if (label === '') throw new TypeError(`prompt-presets: preset ${JSON.stringify(id)} needs a non-empty label`)
    const text = raw.text === undefined ? '' : raw.text
    if (typeof text !== 'string') throw new TypeError(`prompt-presets: preset ${JSON.stringify(id)} text must be a string`)
    // The built-in preset is the passthrough; every other preset is a complete
    // replacement prompt, so empty text would silently erase the prompt.
    if (id !== BUILTIN_PRESET_ID && text.trim() === '') {
      throw new TypeError(`prompt-presets: preset ${JSON.stringify(id)} needs prompt text; custom presets replace DSH's persona/identity`)
    }
    presets.push(Object.freeze({ id, label, text }))
  }
  const defaultPreset = source.defaultPreset === undefined
    ? presets[0].id
    : typeof source.defaultPreset === 'string' ? source.defaultPreset.trim() : ''
  if (!seen.has(defaultPreset)) {
    throw new TypeError(`prompt-presets: defaultPreset ${JSON.stringify(source.defaultPreset)} is not one of the preset ids (${[...seen].join(', ')})`)
  }
  const keepDshBasics = source.keepDshBasics === undefined ? KEEP_DSH_BASICS_DEFAULT : source.keepDshBasics
  if (typeof keepDshBasics !== 'boolean') {
    throw new TypeError('prompt-presets: keepDshBasics must be a boolean')
  }
  const keepDshMechanics = source.keepDshMechanics === undefined
    ? KEEP_DSH_MECHANICS_DEFAULT : source.keepDshMechanics
  if (typeof keepDshMechanics !== 'boolean') {
    throw new TypeError('prompt-presets: keepDshMechanics must be a boolean')
  }
  return Object.freeze({
    presets: Object.freeze(presets),
    byId: new Map(presets.map(preset => [preset.id, preset])),
    defaultPreset,
    keepDshBasics,
    keepDshMechanics,
    // One frozen wire list shared by every view, built from the config in hand.
    views: Object.freeze(presets.map(preset => Object.freeze({ id: preset.id, label: preset.label }))),
  })
}

/** The id a stored selection resolves to: itself when known, else the default. */
export function effectivePresetId(config, id) {
  return config.byId.has(id) ? id : config.defaultPreset
}

/** Initial projection state for an empty log. */
export function initialState(config) {
  return { current: config.defaultPreset, pending: null }
}

/**
 * Fold one committed session event into the projection state.
 * A non-interesting event MUST return the same reference so the registry can
 * skip downstream work.
 * @param config - normalized configuration.
 * @param state - previous state.
 * @param event - committed session event.
 * @returns Next state, or the previous reference when unrelated.
 */
export function foldEvent(config, state, event) {
  if (event === undefined || event === null) return state
  const data = event.data
  if (data === undefined || data === null) return state
  if (event.type === 'command/run') {
    if (data.name !== COMMAND_NAME) return state
    const args = typeof data.args === 'string' ? data.args.trim() : ''
    // A bare invocation only lists presets; it must not reset the session.
    if (args === '') return state
    return { current: state.current, pending: { id: args, commandId: String(data.commandId) } }
  }
  if (event.type === 'command/done') {
    const pending = state.pending
    if (pending === null || String(data.commandId) !== pending.commandId) return state
    if (data.kind === 'success') {
      return { current: effectivePresetId(config, pending.id), pending: null }
    }
    return { current: state.current, pending: null }
  }
  return state
}

/**
 * Client view of the projection: the effective preset, the label list, and
 * whether the recorded choice was removed from the configuration.
 * The current client reads labels from the live settings form and uses this
 * list only while that form is still loading.
 */
export function viewOf(config, state) {
  const known = config.byId.has(state.current)
  return {
    current: known ? state.current : config.defaultPreset,
    presets: config.views,
    missing: !known,
  }
}

/**
 * The complete system-prompt text for one projection state, or `undefined`
 * when the state resolves to the built-in passthrough preset (DSH's own
 * prompt, no replacement).
 *
 * A custom preset replaces DSH's persona/identity. When `keepDshBasics` is on,
 * the short DSH preamble (`DSH_BASICS_TEXT`) is prepended so the model keeps
 * its harness identity, tool guidance, and environment pointer.
 * @param config - normalized configuration.
 * @param state - projection state.
 * @returns the replacement prompt text, or undefined for the passthrough.
 */
export function completePromptText(config, state) {
  if (state === undefined || state === null) return undefined
  const preset = config.byId.get(effectivePresetId(config, state.current))
  if (preset === undefined || preset.id === BUILTIN_PRESET_ID) return undefined
  return config.keepDshBasics ? `${DSH_BASICS_TEXT}\n\n${preset.text}` : preset.text
}

/**
 * Build the section list for one assembly, or `undefined` for the built-in
 * passthrough. The preset text always comes first; when `keepDshMechanics` is
 * on, DSH's non-persona sections follow in their assembled order so the
 * preset does not remove plan mode, PTC, tool guidance, web safety, or file
 * references from the prompt.
 * @param config - normalized configuration.
 * @param state - projection state.
 * @param assembledSections - sections returned by the inner assembly.
 * @returns replacement sections, or undefined for the passthrough.
 */
export function buildPromptSections(config, state, assembledSections) {
  const text = completePromptText(config, state)
  if (text === undefined) return undefined
  const preserved = config.keepDshMechanics !== false && Array.isArray(assembledSections)
    ? assembledSections.filter(section => section !== null && typeof section === 'object'
      && typeof section.name === 'string' && !isReplacedSection(section.name))
    : []
  return [
    { name: PRESET_SECTION_NAME, text, interpolate: false },
    ...preserved.map(section => ({ ...section })),
  ]
}

/**
 * Resolve one `/prompt-preset [id]` invocation without touching state.
 * @param config - normalized configuration.
 * @param rawInput - verbatim argument text from the command executor.
 * @returns A CommandResult.
 */
export function commandAction(config, rawInput) {
  const id = typeof rawInput === 'string' ? rawInput.trim() : ''
  const available = config.presets.map(preset => preset.id).join(', ')
  if (id === '') return { kind: 'success', text: `prompt presets: ${available}` }
  const preset = config.byId.get(id)
  if (preset === undefined) {
    return { kind: 'error', text: `unknown prompt preset ${JSON.stringify(id)}; available: ${available}` }
  }
  // The transcript command card shows this text as its summary; the label
  // alone is the clearest, language-neutral receipt.
  return { kind: 'success', text: preset.label }
}

/**
 * Minimal schema for the persisted projection state. The registry only calls
 * `parse`, and the value must stay plain JSON for checkpointing. Unknown ids
 * stay stored so a removed preset is still distinguishable from a deliberate
 * default selection; readers resolve the effective id.
 */
export function createStateSchema() {
  return {
    parse(value) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError('prompt-presets: projection state must be an object')
      }
      if (typeof value.current !== 'string') {
        throw new TypeError('prompt-presets: projection state.current must be a string')
      }
      if (value.pending !== null) {
        const pending = value.pending
        if (typeof pending !== 'object' || pending === null || Array.isArray(pending)) {
          throw new TypeError('prompt-presets: projection state.pending must be null or an object')
        }
        if (typeof pending.id !== 'string' || typeof pending.commandId !== 'string') {
          throw new TypeError('prompt-presets: projection state.pending needs string id and commandId')
        }
      }
      return {
        current: value.current,
        pending: value.pending === null ? null : { id: value.pending.id, commandId: value.pending.commandId },
      }
    },
  }
}

/** Minimal schema for the client view payload. */
export function createViewSchema(config) {
  return {
    parse(value) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError('prompt-presets: projection view must be an object')
      }
      if (typeof value.current !== 'string' || !Array.isArray(value.presets)) {
        throw new TypeError('prompt-presets: projection view needs current and presets')
      }
      if (value.missing !== undefined && typeof value.missing !== 'boolean') {
        throw new TypeError('prompt-presets: projection view missing must be a boolean when present')
      }
      for (const preset of value.presets) {
        if (typeof preset !== 'object' || preset === null
          || typeof preset.id !== 'string' || typeof preset.label !== 'string') {
          throw new TypeError('prompt-presets: projection view presets must be { id, label }')
        }
      }
      if (!value.presets.some(preset => preset.id === value.current)) {
        throw new TypeError('prompt-presets: projection view current must be one of presets')
      }
      return value
    },
  }
}
