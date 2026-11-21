/**
 * @local/prompt-presets — Host half.
 *
 * Owns one per-session `promptPreset` projection folded from the plugin's own
 * `command/run`/`command/done` records, the `/prompt-preset <id>` command the
 * composer chip and the Settings page submit, and a `system-prompt/assemble`
 * listener that turns a custom preset into the session's whole system prompt.
 *
 * `presets` and `defaultPreset` are volatile Config fields: the Settings page
 * edits them live through the profile settings document, and every read below
 * goes through the current `Volatile` value.
 *
 * @module @local/prompt-presets
 */

import z from '@deepseek-ai/schemastery'
import {
  BUILTIN_PRESET_ID,
  BUILTIN_PRESET_LABEL,
  COMMAND_NAME,
  KEEP_DSH_BASICS_DEFAULT,
  KEEP_DSH_MECHANICS_DEFAULT,
  PRESET_ID_PATTERN,
  PROJECTION_KEY,
  STATE_VERSION,
  buildPromptSections,
  commandAction,
  createStateSchema,
  createViewSchema,
  foldEvent,
  initialState,
  normalizeConfig,
  unwrapVolatile,
  viewOf,
} from './lib/model.js'

/** Volatile fields shown by the Settings page. */
export const Config = z.object({
  /**
   * The preset table. `default` is reserved for the built-in passthrough that
   * leaves DSH's assembled prompt untouched; every other preset's text
   * replaces the whole system prompt.
   */
  presets: z.array(z.object({
    id: z.string().required().pattern(PRESET_ID_PATTERN),
    label: z.string().required(),
    text: z.string().default(''),
  })).default([{ id: BUILTIN_PRESET_ID, label: BUILTIN_PRESET_LABEL, text: '' }]).min(1).volatile(),
  /** Preset used when a session has not recorded a choice, and the fallback. */
  defaultPreset: z.string().default(BUILTIN_PRESET_ID).volatile(),
  /**
   * Prepend the short `DSH_BASICS_TEXT` preamble (identity, tool guidance,
   * environment pointer) to every custom preset. The Settings page owns it.
   */
  keepDshBasics: z.boolean().default(KEEP_DSH_BASICS_DEFAULT).volatile(),
  /**
   * Keep DSH's non-persona operating sections (plan mode, PTC, tool guidance,
   * web safety, file references, MCP instructions) after every custom preset.
   * Off makes the preset text the complete system prompt.
   */
  keepDshMechanics: z.boolean().default(KEEP_DSH_MECHANICS_DEFAULT).volatile(),
})

/** Services this plugin needs; absent ones keep it inactive instead of failing. */
export const inject = ['systemPrompt', 'commands', 'sessionProjections']

/**
 * Register the projection, the switch command, the prompt-replacement listener,
 * and the Settings-page policy.
 * @param ctx - Host context.
 * @param config - resolved Loader row config; `presets`/`defaultPreset` are
 *   volatile refs.
 */
export async function apply(ctx, config) {
  const raw = config === undefined || config === null ? {} : config

  const readRaw = () => ({
    presets: unwrapVolatile(raw.presets),
    defaultPreset: unwrapVolatile(raw.defaultPreset),
    keepDshBasics: unwrapVolatile(raw.keepDshBasics),
    keepDshMechanics: unwrapVolatile(raw.keepDshMechanics),
  })

  // Fail loud on a broken boot config; tolerate a later live edit the Settings
  // page could not have saved but a hand-written patch could.
  let current = normalizeConfig(readRaw())
  let read = readRaw()
  let warned = false
  const currentConfig = () => {
    const next = readRaw()
    if (next.presets === read.presets && next.defaultPreset === read.defaultPreset
      && next.keepDshBasics === read.keepDshBasics
      && next.keepDshMechanics === read.keepDshMechanics) return current
    try {
      current = normalizeConfig(next)
      read = next
      warned = false
    } catch (error) {
      if (!warned) {
        warned = true
        ctx.logger.warn(`prompt-presets: keeping the previous preset table, the live config is invalid: ${String(error)}`)
      }
    }
    return current
  }

  // Fiber-owned registration: the plugin's context releases it on unload.
  const handle = await ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateVersion: STATE_VERSION,
    stateSchema: createStateSchema(),
    init: () => initialState(currentConfig()),
    apply: (state, event) => foldEvent(currentConfig(), state, event),
    wire: {
      // Session list summaries do not need it; an opened Session still does.
      summary: false,
      viewSchema: createViewSchema(),
      view: state => viewOf(currentConfig(), state),
    },
  })

  ctx.commands.register({
    name: COMMAND_NAME,
    description: 'Switch the system prompt preset for this session',
    input: { hint: '<preset-id>' },
    // recordInput stays true (default): the projection folds `command/run.args`.
    handler: invocation => commandAction(currentConfig(), invocation.rawInput),
  })

  // A custom preset replaces DSH's persona/identity. With `keepDshMechanics`
  // on (the default), every other section — plan mode, PTC, tool guidance,
  // web safety, file references, MCP instructions — is preserved after the
  // preset text; turning it off makes the preset the complete prompt. The
  // built-in `default` preset leaves the assembly untouched, and subagent
  // sessions keep their own prompt. A complete section registered by another
  // plugin still wins, because the registry restores it after this waterfall.
  let promptWarned = false
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const agent = context === undefined || context === null ? undefined : context.agent
    const session = agent === undefined || agent === null ? undefined : agent.session
    const subagent = session !== undefined && session !== null && session.header !== undefined
      && session.header !== null && session.header.origin === 'subagent'
    let state
    let config
    if (session !== undefined && session !== null && !subagent) {
      try {
        config = currentConfig()
        state = handle.stateOf(session)
      } catch (error) {
        if (!promptWarned) {
          promptWarned = true
          ctx.logger.warn(`prompt-presets: prompt replacement skipped: ${String(error)}`)
        }
      }
    }
    const result = await next()
    if (state === undefined) return result
    let sections
    try {
      sections = buildPromptSections(config, state, result.sections)
    } catch (error) {
      if (!promptWarned) {
        promptWarned = true
        ctx.logger.warn(`prompt-presets: prompt replacement skipped: ${String(error)}`)
      }
    }
    if (sections === undefined) return result
    return { ...result, sections }
  }, { prepend: true })

  // This plugin ships its own Settings page; suppress any auto-generated form.
  // The deferred describe publishes the namespace once this plugin's fiber is
  // active, so the browser settings mirror learns about it even when the first
  // describe ran during activation.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'prompt-presets: settings presentation')
    const timer = setTimeout(() => {
      try {
        child.settings.describe()
      } catch (error) {
        ctx.logger.warn(`prompt-presets: settings describe failed: ${String(error)}`)
      }
    }, 0)
    child.effect(() => () => clearTimeout(timer), 'prompt-presets: settings describe')
  })

  ctx.logger.info(`prompt-presets: ${String(current.presets.length)} preset(s), default ${JSON.stringify(current.defaultPreset)}, mechanics ${current.keepDshMechanics ? 'on' : 'off'}`)
}
