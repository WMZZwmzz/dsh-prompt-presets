/**
 * @local/prompt-presets — browser half.
 *
 * 1. A chip in the composer tool row (`conversation.input.left`) that reads the
 *    Host `promptPreset` projection for the session's choice and the live
 *    settings form (`prompt-presets` namespace) for labels/fallbacks, then
 *    submits the Host `/prompt-preset <id>` command.
 * 2. A Settings page (`settings.section`) that edits the preset table through
 *    the same Host settings form. The built-in `default` preset is locked: it
 *    leaves DSH's assembled prompt untouched, and every custom preset is a
 *    complete replacement prompt.
 *
 * Plain browser bundle: the module system provides React and React DOM. No
 * Harness Client package is imported (host theme tokens are used instead).
 */
window.__ModuleLoader__.load({
  id: '@local/prompt-presets',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    /** UI locale namespace owned by this plugin. */
    const NS = 'promptPresets'
    /** Host settings namespace (the Loader row id) that carries the live presets. */
    const SETTINGS_NS = 'prompt-presets'
    /** Must match `COMMAND_NAME` in index.js. */
    const COMMAND_NAME = 'prompt-preset'
    /** Projection key owned by the Host half. */
    const PROJECTION_KEY = 'promptPreset'
    /** Reserved built-in preset id: DSH's own prompt, no extra text. */
    const BUILTIN_ID = 'default'
    /** Prepended to custom presets when the Basics option is on; keep in sync with `DSH_BASICS_TEXT` in lib/model.js. */
    const BASICS_TEXT = "You are an AI agent powered by DeepSeek Harness. You interact with the user through the DeepSeek Harness Web GUI.\nUse the tools available in this conversation when they help, and follow each tool's input schema.\nThe current working directory and other environment details are provided in the conversation context."

    const MENU_WIDTH = 236
    const SETTLE_MS = 4200
    const SETTINGS_ORDER = 30

    const zh = {
      'trigger': '系统提示词预设，当前：{name}',
      'trigger.title': '切换当前会话的系统提示词预设',
      'menu.label': '系统提示词预设',
      'menu.title': '系统提示词预设',
      'menu.hint': '自定义预设默认只替换人格/身份并保留 DSH 运行机制；在「设置 → 系统提示词预设」中管理',
      'missing.fallback': '原预设已从配置中移除，当前回退到默认预设',
      'announce.switched': '已切换到 {name}',
      'error.failed': '切换失败，请重试',
      'error.unavailable': '会话尚未就绪，无法切换',
      'error.unconfirmed': '切换未确认，请重试',
      'settings.nav': '系统提示词预设',
      'settings.title': '系统提示词预设',
      'settings.description': '自定义预设的文本会替换 DSH 的人格/身份段落（不是追加）。默认保留 DSH 的运行机制段落（计划模式、PTC、工具规范、Web 安全、文件引用），可在下方关闭；还可选择是否附加一段简短的 DSH 基础信息。内置的「DSH 原有提示词」不做替换。保存后写入当前 profile；「设为默认」的预设用于新建会话，当前会话请在输入框底部的预设按钮中切换。',
      'settings.mechanicsTitle': '保留 DSH 运行机制',
      'settings.mechanicsDescription': '开启后，自定义预设只替换人格/身份，DSH 的计划模式、PTC、工具规范、Web 安全、文件引用等运行段落会保留；关闭后预设文本就是完整的系统提示词。',
      'settings.mechanicsToggle': '保留 DSH 的运行机制段落',
      'settings.basicsTitle': '自定义预设的基础信息',
      'settings.basicsDescription': '开启后，每个自定义预设的文本前都会附加下面这段内容；关闭后不附加。这段只是简短摘要，不包含运行机制段落。',
      'settings.basicsToggle': '保留简短的 DSH 基础信息',
      'settings.basicsPreviewLabel': '附加内容',
      'settings.builtinBadge': '内置',
      'settings.builtinLabel': 'DSH 原有提示词',
      'settings.builtinDescription': '不做替换：直接使用 DSH 原本的系统提示词。',
      'settings.builtinWarning': '配置里的内置项带有文本；保存会清空它。内置项始终代表 DSH 原有提示词，需要自定义内容请新建预设。',
      'settings.customTitle': '自定义预设',
      'settings.customDescription': '每个自定义预设替换 DSH 的人格/身份；默认保留运行机制段落，并可在前面附加一段简短的 DSH 基础信息。关闭「保留 DSH 运行机制」后，预设文本才会整段替换提示词。「设为默认」用于新会话；删除预设后，正在使用它的会话会回退到默认预设。',
      'settings.customEmpty': '还没有自定义预设。',
      'settings.add': '添加预设',
      'settings.newLabel': '新预设',
      'settings.label': '名称',
      'settings.labelPlaceholder': '例如：简洁、代码审查',
      'settings.text': '系统提示词',
      'settings.textPlaceholder': '粘贴系统提示词；默认保留 DSH 运行机制，关闭后会整段替换 DSH 原有的提示词……',
      'settings.makeDefault': '设为默认',
      'settings.delete': '删除',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.saved': '已保存；当前会话请在输入框的预设按钮中切换',
      'settings.reset': '还原',
      'settings.dirty': '有未保存的修改',
      'settings.failed': '保存失败：配置可能已被其他页面改动。草稿已保留，请再次保存以覆盖。',
      'settings.invalidLabel': '预设名称不能为空。',
      'settings.duplicateLabel': '预设名称不能重复。',
      'settings.emptyText': '自定义预设的提示词不能为空：它会替换人格/身份段落。',
      'settings.loading': '加载中…',
      'settings.unavailable': '当前 Host 不提供这项设置。',
      'settings.note': '保存会写入当前 profile 配置，并覆盖插件自带的默认值。「保留 DSH 运行机制」默认开启，会保留计划模式、PTC、工具规范、Web 安全和文件引用；关闭后预设文本就是完整提示词。基础信息只是很短的摘要，请把模型必须知道的内容写进预设。使用 complete persona 的智能体预设（如 minimal）会覆盖本插件，机制保留也不会生效。',
    }

    const en = {
      'trigger': 'Prompt preset — current: {name}',
      'trigger.title': 'Switch the system prompt preset for this session',
      'menu.label': 'Prompt presets',
      'menu.title': 'Prompt presets',
      'menu.hint': 'Custom presets replace the persona/identity and keep DSH runtime mechanics by default; manage them in Settings → Prompt presets',
      'missing.fallback': 'The selected preset was removed from the config; using the default instead',
      'announce.switched': 'Switched to {name}',
      'error.failed': 'Switch failed. Try again',
      'error.unavailable': 'The session is not ready yet',
      'error.unconfirmed': 'The switch was not confirmed. Try again',
      'settings.nav': 'Prompt presets',
      'settings.title': 'Prompt presets',
      'settings.description': "A custom preset's text replaces DSH's persona/identity (it does not append). By default DSH's runtime sections (plan mode, PTC, tool guidance, web safety, file references) are kept; turn that off below for an exact replacement. You can also prepend a short DSH preamble (identity, tool guidance, environment). The built-in DSH original prompt keeps DSH's prompt as-is. Saving writes the current profile; the preset marked as default starts new sessions, and the current session is switched from the preset chip in the composer.",
      'settings.mechanicsTitle': 'Keep DSH runtime mechanics',
      'settings.mechanicsDescription': "When on, a custom preset replaces the persona/identity only; DSH's plan mode, PTC, tool guidance, web safety, file-reference, and MCP sections are kept. When off, the preset text is the complete system prompt.",
      'settings.mechanicsToggle': 'Keep DSH runtime sections',
      'settings.basicsTitle': 'Basics for custom presets',
      'settings.basicsDescription': 'When on, the text below is prepended to every custom preset; when off, nothing is prepended. This is only a short summary, not the runtime sections.',
      'settings.basicsToggle': 'Keep brief DSH basics',
      'settings.basicsPreviewLabel': 'Prepended text',
      'settings.builtinBadge': 'Built-in',
      'settings.builtinLabel': 'DSH original prompt',
      'settings.builtinDescription': "No replacement: uses DSH's original system prompt.",
      'settings.builtinWarning': "The configured built-in preset has text; saving clears it. The built-in entry always means DSH's original prompt; create a preset for custom content.",
      'settings.customTitle': 'Custom presets',
      'settings.customDescription': "Each custom preset replaces DSH's persona/identity; runtime sections are kept by default, and the short DSH preamble can be prepended. Turning off Keep DSH runtime mechanics makes the preset text the complete prompt. Use as default starts new sessions; sessions using a deleted preset fall back to the default.",
      'settings.customEmpty': 'No custom presets yet.',
      'settings.add': 'Add preset',
      'settings.newLabel': 'New preset',
      'settings.label': 'Label',
      'settings.labelPlaceholder': 'For example: Concise, Code review',
      'settings.text': 'System prompt',
      'settings.textPlaceholder': "Paste the system prompt; DSH runtime mechanics are kept by default, or replaced entirely when that option is off…",
      'settings.makeDefault': 'Use as default',
      'settings.delete': 'Delete',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved; switch this session from the composer chip',
      'settings.reset': 'Reset',
      'settings.dirty': 'Unsaved changes',
      'settings.failed': 'Save failed: the configuration may have changed elsewhere. Your draft is kept; save again to overwrite.',
      'settings.invalidLabel': 'A preset label is required.',
      'settings.duplicateLabel': 'Preset labels must be unique.',
      'settings.emptyText': 'A custom preset needs prompt text: it replaces the persona/identity sections.',
      'settings.loading': 'Loading…',
      'settings.unavailable': 'This setting is not available on this host.',
      'settings.note': "Saving writes the current profile and takes precedence over the plugin's bundled defaults. Keep DSH runtime mechanics is on by default and keeps plan mode, PTC, tool guidance, web safety, and file references; turning it off makes the preset text the complete prompt. The basics are only a short summary, so include anything else the model must know in the preset. An agent preset with a complete persona (for example minimal) still overrides this plugin, even with mechanics on.",
    }

    const CSS = `
.dsh-pp-trigger {
  order: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 220px;
  height: 28px;
  padding: 0 4px 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  cursor: pointer;
  flex: 0 1 auto;
}
@media (hover: hover) {
  .dsh-pp-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
}
.dsh-pp-trigger[data-open="true"] { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pp-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
.dsh-pp-glyph { display: inline-flex; flex: 0 0 auto; color: var(--dsw-alias-label-caption); }
.dsh-pp-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-pp-chevron {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--dsw-alias-label-caption);
  transition: transform 120ms ease;
}
.dsh-pp-chevron[data-open="true"] { transform: rotate(180deg); }
.dsh-pp-pending {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  margin-left: 1px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
  animation: dsh-pp-pulse 900ms ease-in-out infinite;
}
.dsh-pp-trigger[data-error="true"]::after {
  content: "";
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  margin-left: 1px;
  border-radius: 50%;
  background: var(--dsw-alias-state-error-primary);
}
@keyframes dsh-pp-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-pp-chevron { transition: none; }
  .dsh-pp-pending { animation: none; opacity: 0.8; }
}
.dsh-pp-menu {
  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  box-shadow: 0 12px 32px var(--dsw-alias-bg-mask-2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  outline: none;
}
.dsh-pp-menu-title {
  padding: 4px 8px 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.dsh-pp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dsh-pp-item:hover:not(:disabled),
.dsh-pp-item:focus { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pp-item:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.dsh-pp-item:disabled { cursor: default; opacity: 0.6; }
.dsh-pp-item-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-pp-check { display: inline-flex; flex: 0 0 auto; color: var(--dsw-alias-brand-primary); }
.dsh-pp-error { padding: 6px 8px 2px; color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 16px; }
.dsh-pp-hint {
  margin-top: 4px;
  padding: 6px 8px 4px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 15px;
}
.dsh-pp-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
@container (max-width: 460px) {
  .dsh-pp-label { display: none; }
}

.dsh-pp-settings {
  box-sizing: border-box;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 4px 0 28px;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh-pp-settings-title { margin: 0 0 4px; font-size: 18px; line-height: 26px; font-weight: 600; }
.dsh-pp-settings-desc { margin: 0 0 16px; color: var(--dsw-alias-label-tertiary); }
.dsh-pp-card {
  box-sizing: border-box;
  margin-bottom: 12px;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2));
  border-radius: var(--dsw-radius-xl);
  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-card-fill));
}
.dsh-pp-card-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 6px; }
.dsh-pp-card-title { min-width: 0; margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; }
.dsh-pp-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 18px;
  font-weight: 500;
}
.dsh-pp-card-desc { margin: 0; color: var(--dsw-alias-label-secondary); }
.dsh-pp-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0 10px;
}
.dsh-pp-section-head > div { flex: 1 1 240px; min-width: 0; }
.dsh-pp-section-title { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; }
.dsh-pp-section-desc { margin: 0 0 10px; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.dsh-pp-field { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.dsh-pp-field-label { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 16px; }
.dsh-pp-input,
.dsh-pp-textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
}
.dsh-pp-textarea { min-height: 84px; resize: vertical; }
.dsh-pp-input:focus-visible,
.dsh-pp-textarea:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
.dsh-pp-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}
.dsh-pp-radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsh-pp-radio input { accent-color: var(--dsw-alias-brand-primary); }
.dsh-pp-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsh-pp-checkbox input { accent-color: var(--dsw-alias-brand-primary); }
.dsh-pp-basics-preview {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dsh-pp-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 0 0 auto;
  height: 30px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: var(--dsw-radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-pp-button:disabled { opacity: 0.55; cursor: default; }
.dsh-pp-button-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-on-color); }
.dsh-pp-button-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dsh-pp-button-ghost {
  background: transparent;
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.dsh-pp-button-ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-pp-button-danger { background: transparent; color: var(--dsw-alias-state-error-primary); }
.dsh-pp-button-danger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-interactive-bg-hover)); }
.dsh-pp-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
}
.dsh-pp-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}
.dsh-pp-status { min-width: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 16px; }
.dsh-pp-status-error { color: var(--dsw-alias-state-error-primary); }
.dsh-pp-warning { margin-top: 8px; color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary)); font-size: 12px; line-height: 16px; }
.dsh-pp-empty { margin: 0; color: var(--dsw-alias-label-tertiary); }
.dsh-pp-note { margin: 14px 0 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
`

    function Glyph() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
        h('rect', { x: 2.25, y: 3.25, width: 11.5, height: 9.5, rx: 2.25, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M5 6.5h6M5 9h4', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
      )
    }

    function Chevron() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M4.5 6.25 8 9.75l3.5-3.5',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function Check() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M3.5 8.5 6.5 11.5 12.5 4.5',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /** Settings navigation glyph: a prompt card. */
    function SettingsIcon(props) {
      const edge = typeof props.size === 'number' ? props.size : 18
      return h('svg', { width: edge, height: edge, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 3.5, y: 4.5, width: 17, height: 13, rx: 3.2, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M7.5 9h9M7.5 12.5h6', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        h('path', { d: 'M9.5 20.5h5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }

    /** Install the plugin stylesheet once; removed when the plugin unloads. */
    function installStyle() {
      const style = document.createElement('style')
      style.setAttribute('data-prompt-presets', '')
      style.textContent = CSS
      document.head.append(style)
      return () => { style.remove() }
    }

    /** Submit one preset through the Host command; never rejects. */
    async function submitPreset(ctx, sessionId, presetId) {
      try {
        const binding = ctx.sessions.binding(sessionId)
        const session = binding === undefined ? undefined : binding.session
        if (session === undefined) return { ok: false, reason: 'unavailable' }
        const result = await session.command('/' + COMMAND_NAME + ' ' + presetId)
        if (!result.ok) return { ok: false, reason: result.error.code }
        if (!result.value.matched) return { ok: false, reason: 'unmatched' }
        return { ok: true }
      } catch (error) {
        return { ok: false, reason: String((error && error.message) || error) }
      }
    }

    /** Label of one preset id, falling back to the id itself. */
    function labelOf(presets, id) {
      const preset = presets.find(candidate => candidate.id === id)
      return preset === undefined ? id : preset.label
    }

    /** Live form value when ready, else the legacy projection list, else null. */
    function resolvePresetSource(view, formState) {
      if (formState !== undefined && formState !== null && formState.status === 'ready'
        && formState.value !== null && typeof formState.value === 'object'
        && Array.isArray(formState.value.presets) && formState.value.presets.length > 0) {
        return {
          presets: formState.value.presets,
          defaultId: typeof formState.value.defaultPreset === 'string' ? formState.value.defaultPreset : BUILTIN_ID,
          live: true,
        }
      }
      if (view !== undefined && view !== null && Array.isArray(view.presets) && view.presets.length > 0) {
        return { presets: view.presets, defaultId: view.presets[0].id, live: false }
      }
      return null
    }

    function PromptPresetChip(props) {
      const t = props.t
      const select = props.select
      const view = props.useProjection(PROJECTION_KEY)
      const formState = props.usePresetForm(snapshot => snapshot)
      const menuId = React.useId()
      const hintId = React.useId()

      const [open, setOpen] = React.useState(false)
      const [anchor, setAnchor] = React.useState(null)
      const [pendingId, setPendingId] = React.useState(null)
      const [errorKey, setErrorKey] = React.useState(null)
      const [announcement, setAnnouncement] = React.useState('')
      const triggerRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const menuRef = React.useRef(null)
      const settleTimer = React.useRef(null)
      const pendingRef = React.useRef(null)

      const source = resolvePresetSource(view, formState)
      const presets = source === null ? [] : source.presets
      const available = source !== null && view !== undefined && view !== null
        && typeof view.current === 'string'
      const storedId = available ? view.current : undefined
      const known = available && presets.some(preset => preset.id === storedId)
      const fallbackId = source !== null && presets.some(preset => preset.id === source.defaultId)
        ? source.defaultId
        : source !== null && presets.length > 0 ? presets[0].id : undefined
      const effectiveId = pendingId !== null && presets.some(preset => preset.id === pendingId)
        ? pendingId
        : known ? storedId : fallbackId
      // The Host view collapses a removed preset to the default; keep the
      // "removed" explanation visible while the live table no longer has it.
      const missing = available && (view.missing === true || !known)

      const clearSettleTimer = () => {
        if (settleTimer.current === null) return
        clearTimeout(settleTimer.current)
        settleTimer.current = null
      }

      // The timer starts with the optimistic pick, not after the command
      // settles: a projection frame can confirm before the promise resolves.
      const armSettleTimer = () => {
        clearSettleTimer()
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null
          if (pendingRef.current === null) return
          setPendingId(null)
          setErrorKey('unconfirmed')
          setAnnouncement(t('error.unconfirmed'))
        }, SETTLE_MS)
      }

      // The Host projection is the confirmation: it closes the menu, restores
      // focus to the trigger, and announces the switch.
      React.useEffect(() => {
        if (pendingId === null || !available || view.current !== pendingId) return
        clearSettleTimer()
        pendingRef.current = null
        setPendingId(null)
        setErrorKey(null)
        setAnnouncement(t('announce.switched', { name: labelOf(presets, pendingId) }))
        if (open) {
          setOpen(false)
          if (triggerRef.current !== null) triggerRef.current.focus()
        }
      }, [pendingId, available, view, open, t, presets])

      React.useEffect(() => clearSettleTimer, [])

      React.useEffect(() => {
        if (available) return
        clearSettleTimer()
        pendingRef.current = null
        setOpen(false)
        setPendingId(null)
        setErrorKey(null)
      }, [available])

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (panelRef.current !== null && target instanceof Node && panelRef.current.contains(target)) return
          if (triggerRef.current !== null && target instanceof Node && triggerRef.current.contains(target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          setOpen(false)
          if (triggerRef.current !== null) triggerRef.current.focus()
        }
        const onViewport = (event) => {
          if (event.type === 'scroll' && panelRef.current !== null
            && event.target instanceof Node && panelRef.current.contains(event.target)) return
          setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('resize', onViewport)
        window.addEventListener('scroll', onViewport, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('resize', onViewport)
          window.removeEventListener('scroll', onViewport, true)
        }
      }, [open])

      React.useLayoutEffect(() => {
        if (!open || menuRef.current === null) return
        const current = menuRef.current.querySelector('[data-current="true"]:not(:disabled)')
        const target = current !== null ? current : menuRef.current.querySelector('[role="menuitemradio"]:not(:disabled)')
        if (target !== null) target.focus()
      }, [open, pendingId])

      if (!available || effectiveId === undefined) return null

      const current = presets.find(preset => preset.id === effectiveId) || presets[0]
      const busy = pendingId !== null

      const openMenu = () => {
        const element = triggerRef.current
        if (element === null) return
        const rect = element.getBoundingClientRect()
        const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - MENU_WIDTH - 8))
        const spaceAbove = rect.top
        const spaceBelow = window.innerHeight - rect.bottom
        const below = spaceAbove < 280 && spaceBelow > spaceAbove
        const room = Math.max(120, (below ? spaceBelow : spaceAbove) - 16)
        setAnchor({
          left,
          width: MENU_WIDTH,
          placement: below ? 'below' : 'above',
          top: Math.round(rect.bottom + 6),
          bottom: Math.round(window.innerHeight - rect.top + 6),
          maxHeight: Math.round(Math.min(360, room)),
        })
        setOpen(true)
      }

      const closeMenu = (focusTrigger) => {
        setOpen(false)
        if (focusTrigger && triggerRef.current !== null) triggerRef.current.focus()
      }

      const choose = (id) => {
        if (pendingId !== null) return
        if (id === effectiveId && !missing) {
          closeMenu(true)
          return
        }
        clearSettleTimer()
        setErrorKey(null)
        setPendingId(id)
        pendingRef.current = id
        armSettleTimer()
        Promise.resolve()
          .then(() => select(id))
          .then((result) => {
            if (result !== undefined && result !== null && result.ok === true) return
            clearSettleTimer()
            pendingRef.current = null
            setPendingId(null)
            const unavailable = result !== undefined && result !== null && result.reason === 'unavailable'
            setErrorKey(unavailable ? 'unavailable' : 'failed')
            setAnnouncement(t(unavailable ? 'error.unavailable' : 'error.failed'))
          })
          .catch(() => {
            clearSettleTimer()
            pendingRef.current = null
            setPendingId(null)
            setErrorKey('failed')
            setAnnouncement(t('error.failed'))
          })
      }

      const onPanelBlur = (event) => {
        const next = event.relatedTarget
        if (next instanceof Node && panelRef.current !== null && panelRef.current.contains(next)) return
        if (next instanceof Node && triggerRef.current !== null && triggerRef.current.contains(next)) return
        setOpen(false)
      }

      const onMenuKeyDown = (event) => {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
        if (keys.indexOf(event.key) < 0 || menuRef.current === null) return
        const items = Array.prototype.slice.call(menuRef.current.querySelectorAll('[role="menuitemradio"]:not(:disabled)'))
        if (items.length === 0) return
        event.preventDefault()
        const index = items.indexOf(document.activeElement)
        let next = 0
        if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length
        else if (event.key === 'ArrowUp') next = index <= 0 ? items.length - 1 : index - 1
        else if (event.key === 'End') next = items.length - 1
        items[next].focus()
      }

      const trigger = h('button', {
        ref: triggerRef,
        type: 'button',
        className: 'dsh-pp-trigger',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': open ? menuId : undefined,
        'aria-busy': busy ? 'true' : undefined,
        'aria-label': t('trigger', { name: current.label }),
        title: errorKey !== null ? t('error.' + errorKey) : t('trigger.title'),
        'data-open': open ? 'true' : 'false',
        'data-error': errorKey !== null ? 'true' : 'false',
        onClick: () => {
          if (open) closeMenu(true)
          else openMenu()
        },
      },
        h('span', { className: 'dsh-pp-glyph', key: 'glyph' }, h(Glyph)),
        h('span', { className: 'dsh-pp-label', key: 'label' }, current.label),
        busy ? h('span', { className: 'dsh-pp-pending', key: 'pending', 'aria-hidden': true }) : null,
        h('span', { className: 'dsh-pp-chevron', key: 'chevron', 'data-open': open ? 'true' : 'false' }, h(Chevron)),
      )

      let menu = null
      if (open && anchor !== null) {
        const style = {
          left: anchor.left + 'px',
          width: anchor.width + 'px',
          maxHeight: anchor.maxHeight + 'px',
        }
        if (anchor.placement === 'below') style.top = anchor.top + 'px'
        else style.bottom = anchor.bottom + 'px'

        menu = ReactDOM.createPortal(
          h('div', {
            ref: panelRef,
            className: 'dsh-pp-menu',
            style,
            onBlur: onPanelBlur,
          },
            h('div', { className: 'dsh-pp-menu-title', key: 'title', 'aria-hidden': true }, t('menu.title')),
            h('div', {
              ref: menuRef,
              key: 'menu',
              role: 'menu',
              id: menuId,
              'aria-label': t('menu.label'),
              'aria-describedby': hintId,
              onKeyDown: onMenuKeyDown,
            },
              presets.map(preset => h('button', {
                key: preset.id,
                type: 'button',
                role: 'menuitemradio',
                'aria-checked': preset.id === effectiveId ? 'true' : 'false',
                'data-current': preset.id === effectiveId ? 'true' : 'false',
                className: 'dsh-pp-item',
                disabled: busy,
                title: preset.label,
                onClick: () => { choose(preset.id) },
              },
                h('span', { className: 'dsh-pp-item-label', key: 'label' }, preset.label),
                preset.id === effectiveId ? h('span', { className: 'dsh-pp-check', key: 'check' }, h(Check)) : null,
              )),
            ),
            missing
              ? h('div', { className: 'dsh-pp-hint', key: 'missing' }, t('missing.fallback'))
              : null,
            errorKey !== null
              ? h('div', { className: 'dsh-pp-error', key: 'error' }, t('error.' + errorKey))
              : null,
            h('div', { className: 'dsh-pp-hint', key: 'hint', id: hintId }, t('menu.hint')),
          ),
          document.body,
        )
      }

      return h(React.Fragment, null,
        h('span', { className: 'dsh-pp-sr-only', key: 'live', role: 'status', 'aria-live': 'polite' }, announcement),
        trigger,
        menu,
      )
    }

    /** Build the editable draft from one accepted form value. */
    function draftFromValue(value, t) {
      const list = Array.isArray(value.presets) ? value.presets : []
      const builtin = list.find(preset => preset.id === BUILTIN_ID)
      const customs = list
        .filter(preset => preset.id !== BUILTIN_ID)
        .map(preset => ({ id: preset.id, label: preset.label, text: preset.text }))
      const ids = [BUILTIN_ID].concat(customs.map(preset => preset.id))
      const storedLabel = builtin !== undefined && typeof builtin.label === 'string' && builtin.label.trim() !== ''
        ? builtin.label
        : t('settings.builtinLabel')
      return {
        builtinText: builtin === undefined ? '' : builtin.text,
        builtinLabel: storedLabel,
        customs,
        defaultPreset: ids.indexOf(value.defaultPreset) >= 0 ? value.defaultPreset : BUILTIN_ID,
        keepDshBasics: value.keepDshBasics !== false,
        keepDshMechanics: value.keepDshMechanics !== false,
      }
    }

    function cloneDraft(draft) {
      return {
        builtinText: draft.builtinText,
        builtinLabel: draft.builtinLabel,
        customs: draft.customs.map(preset => ({ id: preset.id, label: preset.label, text: preset.text })),
        defaultPreset: draft.defaultPreset,
        keepDshBasics: draft.keepDshBasics,
        keepDshMechanics: draft.keepDshMechanics,
      }
    }

    /** Next free generated preset id. */
    function nextPresetId(customs) {
      const used = new Set(customs.map(preset => preset.id))
      for (let index = 1; index < 1000; index += 1) {
        const id = `preset-${String(index)}`
        if (!used.has(id)) return id
      }
      return `preset-${String(Date.now())}`
    }

    function PromptPresetSettings(props) {
      const t = props.t
      const save = props.save
      // Drafts live in an apply-scope cache so switching settings sections and
      // coming back does not discard typed prompt text.
      const cache = props.draft !== undefined && props.draft !== null
        ? props.draft
        : { dirty: false, draft: null }
      const restored = cache.dirty === true && cache.draft !== null && cache.draft !== undefined
      const formState = props.usePresetForm(snapshot => snapshot)
      const [draft, setDraft] = React.useState(() => restored ? cloneDraft(cache.draft) : null)
      const [baseline, setBaseline] = React.useState(null)
      const [dirty, setDirty] = React.useState(restored)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState(null)
      const dirtyRef = React.useRef(false)
      const appliedRef = React.useRef(null)
      dirtyRef.current = dirty

      const accepted = formState !== undefined && formState !== null && formState.status === 'ready'
        && formState.value !== null && typeof formState.value === 'object'
        && Array.isArray(formState.value.presets)
        ? formState.value
        : null
      const revision = formState === undefined || formState === null ? undefined : formState.revision

      React.useEffect(() => {
        if (accepted === null) return
        const key = revision !== undefined ? 'r' + String(revision) : JSON.stringify(accepted)
        if (appliedRef.current === key) return
        appliedRef.current = key
        const normalized = draftFromValue(accepted, t)
        setBaseline(normalized)
        if (dirtyRef.current) return
        cache.dirty = false
        cache.draft = null
        setDraft(normalized)
      }, [accepted, revision, t, cache])

      if (formState === undefined || formState === null || formState.status === 'unavailable') {
        return h('div', { className: 'dsh-pp-settings' },
          h('p', { className: 'dsh-pp-card-desc' }, t('settings.unavailable')))
      }
      if (accepted === null || draft === null) {
        return h('div', { className: 'dsh-pp-settings' },
          h('p', { className: 'dsh-pp-card-desc' }, t('settings.loading')))
      }

      const update = (next) => {
        cache.draft = next
        cache.dirty = true
        setDraft(next)
        setDirty(true)
        setMessage(null)
      }

      const setBuiltinDefault = () => update({ ...draft, defaultPreset: BUILTIN_ID })
      const setCustomDefault = (id) => update({ ...draft, defaultPreset: id })
      const changeLabel = (id, label) => update({
        ...draft,
        customs: draft.customs.map(preset => preset.id === id ? { ...preset, label } : preset),
      })
      const changeText = (id, text) => update({
        ...draft,
        customs: draft.customs.map(preset => preset.id === id ? { ...preset, text } : preset),
      })
      const toggleBasics = () => update({ ...draft, keepDshBasics: draft.keepDshBasics !== true })
      const toggleMechanics = () => update({ ...draft, keepDshMechanics: draft.keepDshMechanics !== true })
      const addPreset = () => {
        const id = nextPresetId(draft.customs)
        update({
          ...draft,
          customs: draft.customs.concat([{ id, label: t('settings.newLabel'), text: '' }]),
        })
      }
      const removePreset = (id) => {
        update({
          ...draft,
          customs: draft.customs.filter(preset => preset.id !== id),
          defaultPreset: draft.defaultPreset === id ? BUILTIN_ID : draft.defaultPreset,
        })
      }
      const focusLabel = (id) => {
        const element = document.getElementById('dsh-pp-label-' + id)
        if (element !== null && typeof element.focus === 'function') element.focus()
      }
      const focusText = (id) => {
        const element = document.getElementById('dsh-pp-text-' + id)
        if (element !== null && typeof element.focus === 'function') element.focus()
      }
      const onReset = () => {
        if (baseline === null) return
        cache.draft = null
        cache.dirty = false
        setDraft(cloneDraft(baseline))
        setDirty(false)
        setMessage(null)
      }
      const onSave = () => {
        if (busy) return
        const empty = draft.customs.find(preset => preset.label.trim() === '')
        if (empty !== undefined) {
          setMessage('invalid')
          focusLabel(empty.id)
          return
        }
        const labels = draft.customs.map(preset => preset.label.trim())
        const duplicated = labels.find((label, index) => labels.indexOf(label) !== index)
        if (duplicated !== undefined) {
          const first = draft.customs.find(preset => preset.label.trim() === duplicated)
          setMessage('duplicate')
          if (first !== undefined) focusLabel(first.id)
          return
        }
        // A custom preset replaces the persona/identity; an empty one would erase it.
        const emptyText = draft.customs.find(preset => preset.text.trim() === '')
        if (emptyText !== undefined) {
          setMessage('emptyText')
          focusText(emptyText.id)
          return
        }
        const builtinLabel = typeof draft.builtinLabel === 'string' && draft.builtinLabel.trim() !== ''
          ? draft.builtinLabel.trim()
          : t('settings.builtinLabel')
        const presets = [{
          id: BUILTIN_ID,
          label: builtinLabel,
          text: '',
        }].concat(draft.customs.map(preset => ({
          id: preset.id,
          label: preset.label.trim(),
          text: preset.text,
        })))
        setBusy(true)
        setMessage(null)
        save([
          { op: 'set', path: ['presets'], value: presets },
          { op: 'set', path: ['defaultPreset'], value: draft.defaultPreset },
          { op: 'set', path: ['keepDshBasics'], value: draft.keepDshBasics === true },
          { op: 'set', path: ['keepDshMechanics'], value: draft.keepDshMechanics !== false },
        ], revision)
          .then((ok) => {
            setBusy(false)
            if (ok === true) {
              cache.draft = null
              cache.dirty = false
              setDirty(false)
              setMessage('saved')
            } else {
              setMessage('failed')
            }
          })
          .catch(() => {
            setBusy(false)
            setMessage('failed')
          })
      }

      const status = message === 'invalid'
        ? t('settings.invalidLabel')
        : message === 'duplicate'
          ? t('settings.duplicateLabel')
          : message === 'emptyText'
            ? t('settings.emptyText')
            : message === 'saved'
              ? t('settings.saved')
              : message === 'failed'
                ? t('settings.failed')
                : dirty
                  ? t('settings.dirty')
                  : ''
      const statusError = message === 'failed' || message === 'invalid' || message === 'duplicate' || message === 'emptyText'
      const emptyLabels = new Set(draft.customs
        .filter(preset => preset.label.trim() === '')
        .map(preset => preset.id))
      const emptyTexts = new Set(draft.customs
        .filter(preset => preset.text.trim() === '')
        .map(preset => preset.id))

      const builtinCard = h('div', { className: 'dsh-pp-card', key: 'builtin' },
        h('div', { className: 'dsh-pp-card-head' },
          h('h3', { className: 'dsh-pp-card-title' }, draft.builtinLabel),
          h('span', { className: 'dsh-pp-badge' }, t('settings.builtinBadge')),
        ),
        h('p', { className: 'dsh-pp-card-desc' }, t('settings.builtinDescription')),
        draft.builtinText === ''
          ? null
          : h('p', { className: 'dsh-pp-warning' }, t('settings.builtinWarning')),
        h('div', { className: 'dsh-pp-card-actions' },
          h('label', { className: 'dsh-pp-radio' },
            h('input', {
              type: 'radio',
              name: 'dsh-pp-default-preset',
              checked: draft.defaultPreset === BUILTIN_ID,
              disabled: busy,
              'aria-label': t('settings.makeDefault') + ' — ' + draft.builtinLabel,
              onChange: setBuiltinDefault,
            }),
            t('settings.makeDefault'),
          ),
          h('span'),
        ),
      )

      const mechanicsCard = h('div', { className: 'dsh-pp-card', key: 'mechanics' },
        h('div', { className: 'dsh-pp-card-head' },
          h('h3', { className: 'dsh-pp-card-title' }, t('settings.mechanicsTitle')),
        ),
        h('p', { className: 'dsh-pp-card-desc' }, t('settings.mechanicsDescription')),
        h('label', { className: 'dsh-pp-checkbox' },
          h('input', {
            type: 'checkbox',
            checked: draft.keepDshMechanics !== false,
            disabled: busy,
            onChange: toggleMechanics,
          }),
          t('settings.mechanicsToggle'),
        ),
      )

      const basicsCard = h('div', { className: 'dsh-pp-card', key: 'basics' },
        h('div', { className: 'dsh-pp-card-head' },
          h('h3', { className: 'dsh-pp-card-title' }, t('settings.basicsTitle')),
        ),
        h('p', { className: 'dsh-pp-card-desc' }, t('settings.basicsDescription')),
        h('label', { className: 'dsh-pp-checkbox' },
          h('input', {
            type: 'checkbox',
            checked: draft.keepDshBasics === true,
            disabled: busy,
            onChange: toggleBasics,
          }),
          t('settings.basicsToggle'),
        ),
        h('div', { className: 'dsh-pp-field' },
          h('span', { className: 'dsh-pp-field-label' }, t('settings.basicsPreviewLabel')),
          h('pre', { className: 'dsh-pp-basics-preview' }, BASICS_TEXT),
        ),
      )

      const cards = draft.customs.map(preset => h('div', { className: 'dsh-pp-card', key: preset.id },
        h('div', { className: 'dsh-pp-field' },
          h('label', { className: 'dsh-pp-field-label', htmlFor: 'dsh-pp-label-' + preset.id }, t('settings.label')),
          h('input', {
            id: 'dsh-pp-label-' + preset.id,
            className: 'dsh-pp-input',
            type: 'text',
            value: preset.label,
            placeholder: t('settings.labelPlaceholder'),
            disabled: busy,
            'aria-invalid': emptyLabels.has(preset.id) ? 'true' : undefined,
            onChange: event => changeLabel(preset.id, event.target.value),
          }),
        ),
        h('div', { className: 'dsh-pp-field' },
          h('label', { className: 'dsh-pp-field-label', htmlFor: 'dsh-pp-text-' + preset.id }, t('settings.text')),
          h('textarea', {
            id: 'dsh-pp-text-' + preset.id,
            className: 'dsh-pp-textarea',
            value: preset.text,
            placeholder: t('settings.textPlaceholder'),
            rows: 4,
            disabled: busy,
            'aria-invalid': emptyTexts.has(preset.id) ? 'true' : undefined,
            onChange: event => changeText(preset.id, event.target.value),
          }),
        ),
        h('div', { className: 'dsh-pp-card-actions' },
          h('label', { className: 'dsh-pp-radio' },
            h('input', {
              type: 'radio',
              name: 'dsh-pp-default-preset',
              checked: draft.defaultPreset === preset.id,
              disabled: busy,
              'aria-label': t('settings.makeDefault') + ' — ' + (preset.label.trim() || t('settings.newLabel')),
              onChange: () => setCustomDefault(preset.id),
            }),
            t('settings.makeDefault'),
          ),
          h('button', {
            type: 'button',
            className: 'dsh-pp-button dsh-pp-button-danger',
            disabled: busy,
            'aria-label': t('settings.delete') + ' — ' + (preset.label.trim() || t('settings.newLabel')),
            onClick: () => removePreset(preset.id),
          }, t('settings.delete')),
        ),
      ))

      return h('div', { className: 'dsh-pp-settings' },
        h('h2', { className: 'dsh-pp-settings-title' }, t('settings.title')),
        h('p', { className: 'dsh-pp-settings-desc' }, t('settings.description')),
        builtinCard,
        mechanicsCard,
        basicsCard,
        h('div', { className: 'dsh-pp-section-head' },
          h('div', null,
            h('h3', { className: 'dsh-pp-section-title' }, t('settings.customTitle')),
            h('p', { className: 'dsh-pp-section-desc' }, t('settings.customDescription')),
          ),
          h('button', {
            type: 'button',
            className: 'dsh-pp-button dsh-pp-button-ghost',
            disabled: busy,
            onClick: addPreset,
          }, t('settings.add')),
        ),
        cards.length === 0
          ? h('p', { className: 'dsh-pp-empty' }, t('settings.customEmpty'))
          : cards,
        h('div', { className: 'dsh-pp-footer' },
          h('button', {
            type: 'button',
            className: 'dsh-pp-button dsh-pp-button-ghost',
            onClick: onReset,
            disabled: busy || !dirty,
          }, t('settings.reset')),
          h('button', {
            type: 'button',
            className: 'dsh-pp-button dsh-pp-button-primary',
            onClick: onSave,
            disabled: busy || !dirty,
          }, busy ? t('settings.saving') : t('settings.save')),
          h('span', {
            className: 'dsh-pp-status' + (statusError ? ' dsh-pp-status-error' : ''),
            role: 'status',
          }, status),
        ),
        h('p', { className: 'dsh-pp-note' }, t('settings.note')),
      )
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'prompt-presets: dictionaries')
        ctx.effect(() => installStyle(), 'prompt-presets: styles')

        const form = ctx.configForms.get(SETTINGS_NS)
        // A plain store face: the renderer binds injected hook sources without
        // a receiver, so the ConfigForm's methods must be wrapped.
        const formStore = {
          getSnapshot: () => form.getSnapshot(),
          subscribe: listener => form.subscribe(listener),
        }
        // Survives section switches and Settings-panel close/reopen inside one
        // browser plugin lifetime, so an unsaved draft is not silently lost.
        const draftCache = { dirty: false, draft: null }

        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'prompt-preset',
          // Visual placement is the trigger's CSS `order: 2`; this keeps a
          // deterministic position among other left-row contributions.
          order: 50,
          locale: NS,
          inject: sessionId => ({
            select: presetId => submitPreset(ctx, sessionId, presetId),
            hooks: { presetForm: formStore },
          }),
        }, PromptPresetChip))

        ctx.effect(() => ctx.configForms.whileServed([SETTINGS_NS], () => {
          const offSection = ctx.slots.inject('settings.section', () => ctx.slots.register({
            name: 'settings.section',
            id: SETTINGS_NS,
            order: SETTINGS_ORDER,
            label: () => ctx.locale.bind(NS)('settings.nav'),
            locale: NS,
            inject: () => ({
              hooks: { presetForm: formStore },
              draft: draftCache,
              save: (ops, expectedRevision) => form.mutate(ops, expectedRevision),
            }),
          }, PromptPresetSettings))
          const offIcon = ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
            name: 'settings.section.icon',
            id: SETTINGS_NS,
          }, SettingsIcon))
          return () => {
            offSection()
            offIcon()
          }
        }), 'prompt-presets: settings section')
      },
    }
  },
})
