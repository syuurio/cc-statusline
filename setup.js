import * as p from '@clack/prompts'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlinkSync } from 'node:fs'

import { generateScript } from './lib/generate.js'
import { detectCredentials } from './lib/detect-credentials.js'
import { applyStatusLine } from './lib/patch-settings.js'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const SCRIPT_DEST = join(homedir(), '.claude', 'statusline-command.sh')
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

p.intro(`cc-statusline setup · v${pkg.version}`)

// ── Step 1: Detect credentials ──────────────────────────────────────────

let hasOAuth = false
try {
  hasOAuth = detectCredentials()
} catch {
  // Silently fail — treat as no credentials
}

if (!hasOAuth) {
  p.note(
    'No OAuth credentials found.\nRate limit fields (5h/7d bars, reset times) will be hidden.',
    'Credentials'
  )
}

// ── Step 2: Wizard prompts ──────────────────────────────────────────────

const allFields = [
  { value: 'account', label: 'Account', hint: '◆ work (DEV_PROFILE or CLAUDE_CONFIG_DIR)' },
  { value: 'model', label: 'Model name', hint: '🤖 Opus 4' },
  { value: 'dir', label: 'Directory', hint: 'folder name' },
  { value: 'git', label: 'Git branch', hint: 'with dirty indicator' },
  { value: 'tokens', label: 'Token count', hint: '57.0K/200.0K' },
  { value: 'cost', label: 'Session cost', hint: '$1.23' },
  { value: 'ctxBar', label: 'Context bar', hint: '[ctx] ━━──── 28%' },
]

if (hasOAuth) {
  allFields.push(
    { value: 'rateBar', label: '5h/7d rate bars', hint: '[5h] ━━━━━───── 50%' },
    { value: 'resetTimes', label: 'Reset times', hint: '[↻5h] 04:00 21 Feb' },
  )
}

const config = await p.group(
  {
    fields: () =>
      p.multiselect({
        message: 'Which fields to show?',
        options: allFields,
        initialValues: allFields.map(f => f.value),
        required: true,
      }),

    separator: () =>
      p.select({
        message: 'Separator character',
        options: [
          { value: '›', label: '› (default)' },
          { value: '|', label: '|' },
          { value: '·', label: '·' },
          { value: '→', label: '→' },
        ],
      }),

    colorScheme: () =>
      p.select({
        message: 'Color scheme',
        options: [
          { value: 'default', label: 'Default (ANSI 256 palette)' },
          { value: 'traffic-light', label: 'Traffic light (green/yellow/red)' },
          { value: 'monochrome', label: 'Monochrome (no colors)' },
        ],
      }),

    barStyle: () =>
      p.select({
        message: 'Bar style',
        options: [
          { value: 'thin', label: 'Thin  ━─' },
          { value: 'dot', label: 'Dot   ●○' },
          { value: 'block', label: 'Block █░' },
        ],
      }),

    warnThreshold: () =>
      p.text({
        message: 'Warn threshold %',
        placeholder: '50',
        initialValue: '50',
        validate: (v) => {
          const n = Number(v)
          if (isNaN(n) || n < 0 || n > 100) return 'Must be 0-100'
        },
      }),

    dangerThreshold: () =>
      p.text({
        message: 'Danger threshold %',
        placeholder: '80',
        initialValue: '80',
        validate: (v) => {
          const n = Number(v)
          if (isNaN(n) || n < 0 || n > 100) return 'Must be 0-100'
        },
      }),
  },
  {
    onCancel: () => {
      p.cancel('Setup cancelled.')
      process.exit(0)
    },
  }
)

// ── Step 3: Build config & generate ─────────────────────────────────────

const scriptConfig = {
  fields: config.fields,
  separator: config.separator,
  colorScheme: config.colorScheme,
  barStyle: config.barStyle,
  thresholds: {
    warn: Number(config.warnThreshold),
    danger: Number(config.dangerThreshold),
  },
}

const script = generateScript(scriptConfig)

// ── Step 4: Live preview ────────────────────────────────────────────────

const sampleJson = JSON.stringify({
  model: { display_name: 'Claude Opus 4' },
  workspace: { current_dir: '/Users/demo/my-project' },
  context_window: {
    remaining_percentage: 72,
    total_input_tokens: 45000,
    total_output_tokens: 12000,
    context_window_size: 200000,
  },
  cost: { total_cost_usd: 1.23 },
  session_id: 'preview-session',
})

let previewOutput = ''
try {
  const tmpFile = join(tmpdir(), `cc-statusline-preview-${Date.now()}.sh`)
  writeFileSync(tmpFile, script, { mode: 0o700 })
  try {
    previewOutput = execSync(`echo '${sampleJson.replace(/'/g, "'\\''")}' | bash "${tmpFile}"`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } finally {
    unlinkSync(tmpFile)
  }
} catch {
  previewOutput = '(preview unavailable — requires jq, bc, git)'
}

if (previewOutput) {
  p.note(previewOutput, 'Preview')
}

// ── Step 5: Confirm & write ─────────────────────────────────────────────

const shouldWrite = await p.confirm({
  message: `Write config to ~/.claude/?`,
})

if (p.isCancel(shouldWrite) || !shouldWrite) {
  p.cancel('Setup cancelled — no files written.')
  process.exit(0)
}

// Ensure ~/.claude/ exists
const claudeDir = join(homedir(), '.claude')
if (!existsSync(claudeDir)) {
  mkdirSync(claudeDir, { recursive: true })
}

// Write generated script
writeFileSync(SCRIPT_DEST, script, { mode: 0o755 })
p.log.success(`Script written to ${SCRIPT_DEST}`)

// Patch settings.json
let settingsJson = '{}'
if (existsSync(SETTINGS_PATH)) {
  try {
    settingsJson = readFileSync(SETTINGS_PATH, 'utf8')
  } catch {
    // If unreadable, start fresh
  }
}

try {
  const patched = applyStatusLine(settingsJson, SCRIPT_DEST)
  writeFileSync(SETTINGS_PATH, patched)
  p.log.success(`Settings patched at ${SETTINGS_PATH}`)
} catch (e) {
  p.log.error(`Failed to patch settings: ${e.message}`)
  p.log.info(`You can manually add to ${SETTINGS_PATH}:`)
  p.log.info(`  "statusLine": { "type": "command", "command": "bash ${SCRIPT_DEST}" }`)
}

p.outro('Restart Claude Code to see your new status line.')
