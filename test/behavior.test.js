import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { generateScript } from '../lib/generate.js'
import { DEFAULT_CONFIG } from '../lib/defaults.js'

// Runs a generated script against a stdin payload.
// Returns ANSI-stripped output lines plus stderr, so shell errors fail tests.
function run(input, { config = DEFAULT_CONFIG, env = {} } = {}) {
  const result = spawnSync('bash', ['-c', generateScript(config)], {
    input: JSON.stringify(input),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
  })
  return {
    lines: result.stdout.replace(/\x1b\[[0-9;]*m/g, '').split('\n'),
    stderr: result.stderr,
  }
}

function render(input, opts) {
  const { lines, stderr } = run(input, opts)
  assert.equal(stderr, '', 'script wrote to stderr')
  return lines
}

const base = {
  model: { display_name: 'Claude Opus 4' },
  context_window: {
    used_percentage: 30,
    context_window_size: 200000,
    total_input_tokens: 60000,
    total_output_tokens: 800,
  },
  cost: { total_cost_usd: 3.2 },
}

describe('rendered output', () => {
  it('float used_percentage renders without arithmetic errors', () => {
    const lines = render({ ...base, context_window: { ...base.context_window, used_percentage: 42.7 } })
    assert.match(lines.join('\n'), /\[ctx\] ━━━━────── 42%/)
  })

  it('null used_percentage early in a session renders as 0%', () => {
    const lines = render({ ...base, context_window: { used_percentage: null } })
    assert.match(lines.join('\n'), /\[ctx\] ────────── 0%/)
  })

  it('shows a placeholder for the 5h window when only 7d is present', () => {
    const text = render({
      ...base,
      rate_limits: { seven_day: { used_percentage: 91.2, resets_at: 1790000000 } },
    }).join('\n')
    assert.match(text, /\[7d\] ━━━━━━━━━─ 91%/)
    assert.match(text, /\[5h\] ────────── --%/)
    assert.match(text, /\[↻ 5h\] — › \[↻ 7d\] \d/)
  })

  it('shows a placeholder for the 7d window when only 5h is present', () => {
    const text = render({
      ...base,
      rate_limits: { five_hour: { used_percentage: 12, resets_at: 1790000000 } },
    }).join('\n')
    assert.match(text, /\[5h\] ━───────── 12%/)
    assert.match(text, /\[7d\] ────────── --%/)
    assert.match(text, /\[↻ 7d\] —$/)
  })

  it('keeps the three-line layout before rate limits arrive', () => {
    const lines = render(base)
    assert.equal(lines.length, 3)
    assert.match(lines[1], /^├ \[ctx\].*\[5h\] ────────── --% › \[7d\] ────────── --%$/)
    assert.equal(lines[2], '╰ [↻ 5h] — › [↻ 7d] —')
  })

  it('shows three lines when both rate windows are present', () => {
    const lines = render({
      ...base,
      rate_limits: {
        five_hour: { used_percentage: 50, resets_at: 1790000000 },
        seven_day: { used_percentage: 80, resets_at: 1790500000 },
      },
    })
    assert.equal(lines.length, 3)
    assert.match(lines[1], /^├ \[ctx\].*\[5h\].*\[7d\]/)
    assert.match(lines[2], /^╰ \[↻ 5h\].*\[↻ 7d\]/)
  })

  it('prints one line when only line-1 fields are selected', () => {
    const lines = render(base, { config: { ...DEFAULT_CONFIG, fields: ['model'] } })
    assert.deepEqual(lines, ['🤖 Opus 4'])
  })

  it('prints two lines with bars but no reset times', () => {
    const lines = render(base, { config: { ...DEFAULT_CONFIG, fields: ['model', 'ctxBar'] } })
    assert.equal(lines.length, 2)
    assert.match(lines[1], /^╰ \[ctx\]/)
  })

  it('uses total_input_tokens for context tokens and shows cost alone', () => {
    const line1 = render(base)[0]
    assert.match(line1, /60\.0K\/200\.0K/)
    assert.match(line1, /› \$3\.20$/)
    assert.doesNotMatch(line1, /60\.8K/)
  })
})

describe('account field', () => {
  it('derives the name from CLAUDE_CONFIG_DIR', () => {
    const line1 = render(base, { env: { CLAUDE_CONFIG_DIR: '/Users/me/.claude-work' } })[0]
    assert.match(line1, /^◆ work › /)
  })

  it('config dir wins over a mismatched DEV_PROFILE', () => {
    const line1 = render(base, { env: { DEV_PROFILE: 'personal', CLAUDE_CONFIG_DIR: '/Users/me/.claude-work' } })[0]
    assert.match(line1, /^◆ work › /)
  })

  it('uses DEV_PROFILE only for the default config dir', () => {
    assert.match(render(base, { env: { DEV_PROFILE: 'personal' } })[0], /^◆ personal › /)
  })

  it('shows "default" for the default config dir', () => {
    assert.match(render(base)[0], /^◆ default › /)
    assert.match(render(base, { env: { CLAUDE_CONFIG_DIR: '/Users/me/.claude' } })[0], /^◆ default › /)
  })

  it('is omitted when the field is not selected', () => {
    const config = { ...DEFAULT_CONFIG, fields: DEFAULT_CONFIG.fields.filter(f => f !== 'account') }
    const line1 = render(base, { config, env: { DEV_PROFILE: 'work' } })[0]
    assert.doesNotMatch(line1, /◆/)
    assert.match(line1, /^🤖 Opus 4/)
  })
})

describe('effort field', () => {
  it('renders as its own segment after the model', () => {
    const line1 = render({ ...base, effort: { level: 'xhigh' } })[0]
    assert.match(line1, /🤖 Opus 4 › ⚡ xhigh › /)
  })

  it('colors high levels distinctly from low ones', () => {
    const raw = (level) => spawnSync('bash', ['-c', generateScript(DEFAULT_CONFIG)], {
      input: JSON.stringify({ ...base, effort: { level } }),
      encoding: 'utf8',
    }).stdout
    assert.match(raw('low'), /\x1b\[38;5;245m⚡ low/)
    assert.match(raw('high'), /\x1b\[38;5;116m⚡ high/)
    assert.match(raw('max'), /\x1b\[1m\x1b\[38;5;215m⚡ max/)
  })

  it('is omitted when the model does not report effort', () => {
    assert.doesNotMatch(render(base)[0], /⚡/)
  })
})
