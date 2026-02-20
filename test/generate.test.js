import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { generateScript } from '../lib/generate.js'

const allFields = ['model', 'dir', 'git', 'tokens', 'cost', 'ctxBar', 'rateBar', 'resetTimes']

const defaultConfig = {
  fields: allFields,
  separator: '›',
  colorScheme: 'default',
  barStyle: 'thin',
  thresholds: { warn: 50, danger: 80 },
}

function bashSyntaxCheck(script) {
  execSync('bash -n', { input: script, stdio: ['pipe', 'pipe', 'pipe'] })
}

describe('generateScript', () => {
  it('generates valid bash (all fields)', () => {
    const script = generateScript(defaultConfig)
    bashSyntaxCheck(script)
  })

  it('generates valid bash (minimal fields)', () => {
    const script = generateScript({ ...defaultConfig, fields: ['model'] })
    bashSyntaxCheck(script)
  })

  it('generates valid bash (only bars, no rate)', () => {
    const script = generateScript({ ...defaultConfig, fields: ['ctxBar'] })
    bashSyntaxCheck(script)
  })

  it('generates valid bash (resetTimes without rateBar)', () => {
    const script = generateScript({ ...defaultConfig, fields: ['model', 'resetTimes'] })
    bashSyntaxCheck(script)
  })

  it('all fields → output references all 3 lines', () => {
    const script = generateScript(defaultConfig)
    assert.match(script, /line1/)
    assert.match(script, /line2/)
    assert.match(script, /line3/)
    // printf should output all 3 lines
    assert.match(script, /printf "%s\\n%s\\n%s" "\$line1" "\$line2" "\$line3"/)
  })

  it('rateBar excluded → no get_access_token / fetch_usage_bg', () => {
    const script = generateScript({
      ...defaultConfig,
      fields: ['model', 'dir', 'tokens', 'cost', 'ctxBar'],
    })
    assert.ok(!script.includes('get_access_token'))
    assert.ok(!script.includes('fetch_usage_bg'))
    assert.ok(!script.includes('CACHE_DIR'))
  })

  it('resetTimes excluded → no format_reset_time', () => {
    const script = generateScript({
      ...defaultConfig,
      fields: ['model', 'dir', 'ctxBar', 'rateBar'],
    })
    assert.ok(!script.includes('format_reset_time'))
  })

  it('thin bar style → ━ and ─', () => {
    const script = generateScript({ ...defaultConfig, barStyle: 'thin' })
    assert.ok(script.includes('━'))
    assert.ok(script.includes('─'))
  })

  it('dot bar style → ● and ○', () => {
    const script = generateScript({ ...defaultConfig, barStyle: 'dot' })
    assert.ok(script.includes('●'))
    assert.ok(script.includes('○'))
  })

  it('block bar style → █ and ░', () => {
    const script = generateScript({ ...defaultConfig, barStyle: 'block' })
    assert.ok(script.includes('█'))
    assert.ok(script.includes('░'))
  })

  it('monochrome scheme → no ANSI escape codes in color vars', () => {
    const script = generateScript({ ...defaultConfig, colorScheme: 'monochrome' })
    // Color variable declarations should all be empty
    const colorLines = script.split('\n').filter(l => /^C_\w+=/.test(l))
    for (const line of colorLines) {
      assert.match(line, /=''$/, `Expected empty value: ${line}`)
    }
    // No \033 escape sequences
    assert.ok(!script.includes("\\033"))
  })

  it('custom thresholds are embedded', () => {
    const script = generateScript({
      ...defaultConfig,
      thresholds: { warn: 30, danger: 70 },
    })
    assert.ok(script.includes('USAGE_WARN=30'))
    assert.ok(script.includes('USAGE_DANGER=70'))
  })

  it('custom separator is embedded', () => {
    const script = generateScript({ ...defaultConfig, separator: '|' })
    assert.ok(script.includes('ICON_SEPARATOR="|"'))
  })

  it('tokens excluded → no format_tokens', () => {
    const script = generateScript({
      ...defaultConfig,
      fields: ['model', 'dir'],
    })
    assert.ok(!script.includes('format_tokens'))
  })

  it('no bar fields → no progress_bar or get_usage_color', () => {
    const script = generateScript({
      ...defaultConfig,
      fields: ['model', 'dir', 'tokens', 'cost'],
    })
    assert.ok(!script.includes('progress_bar'))
    assert.ok(!script.includes('get_usage_color'))
  })

  it('printf outputs correct number of lines', () => {
    // 1 line (no bars, no reset)
    const s1 = generateScript({ ...defaultConfig, fields: ['model'] })
    assert.match(s1, /printf "%s" "\$line1"/)

    // 2 lines (with ctx bar, no reset)
    const s2 = generateScript({ ...defaultConfig, fields: ['model', 'ctxBar'] })
    assert.match(s2, /printf "%s\\n%s" "\$line1" "\$line2"/)

    // 3 lines (with bars and reset)
    const s3 = generateScript(defaultConfig)
    assert.match(s3, /printf "%s\\n%s\\n%s" "\$line1" "\$line2" "\$line3"/)
  })
})
