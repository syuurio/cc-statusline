import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, statSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = new URL('../lib/cli.js', import.meta.url).pathname
const SAMPLE = JSON.stringify({ model: { display_name: 'Claude Opus 4' }, effort: { level: 'high' } })

function cli(args, env = {}) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
}

function render(script) {
  return spawnSync('bash', [script], { input: SAMPLE, encoding: 'utf8' }).stdout.replace(/\x1b\[[0-9;]*m/g, '')
}

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'cc-cli-'))
  return { data: join(dir, 'data'), configDir: join(dir, 'claude'), dir }
}

describe('cli generate', () => {
  it('writes an executable script from a config file', () => {
    const { dir } = sandbox()
    const config = join(dir, 'config.json')
    const out = join(dir, 'out.sh')
    writeFileSync(config, JSON.stringify({ fields: ['model', 'effort'], separator: '|' }))
    const result = cli(['generate', '--config', config, '--out', out])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(statSync(out).mode & 0o777, 0o755)
    assert.equal(render(out), '🤖 Opus 4 | ⚡ high')
  })

  it('rejects unknown fields with a readable error', () => {
    const { dir } = sandbox()
    const config = join(dir, 'config.json')
    writeFileSync(config, JSON.stringify({ fields: ['model', 'bogus'] }))
    const result = cli(['generate', '--config', config, '--out', join(dir, 'out.sh')])
    assert.equal(result.status, 1)
    assert.equal(result.stderr.trim(), 'cc-statusline: unknown fields: bogus')
  })

  it('rejects a non-array fields value', () => {
    const { dir } = sandbox()
    const config = join(dir, 'config.json')
    writeFileSync(config, JSON.stringify({ fields: 'model' }))
    const result = cli(['generate', '--config', config, '--out', join(dir, 'out.sh')])
    assert.equal(result.stderr.trim(), 'cc-statusline: config.fields must be a non-empty array')
  })

  it('names missing options', () => {
    assert.equal(cli(['generate']).stderr.trim(), 'cc-statusline: generate: missing --config, --out')
  })
})

describe('cli install / uninstall', () => {
  it('installs the default script and patches settings in CLAUDE_CONFIG_DIR', () => {
    const { data, configDir } = sandbox()
    const settingsFile = join(configDir, 'settings.json')
    const env = { CLAUDE_CONFIG_DIR: configDir }
    const result = cli(['install', '--data', data], env)
    assert.equal(result.status, 0, result.stderr)
    const script = join(data, 'statusline-command.sh')
    assert.match(render(script), /🤖 Opus 4 › ⚡ high/)
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
    assert.ok(settings.statusLine.command.includes(script))
    assert.equal(existsSync(join(data, 'config.json')), false)
  })

  it('installs a custom config and keeps it for later regeneration', () => {
    const { data, configDir } = sandbox()
    const result = cli(['install', '--data', data, '--config', '{"fields":["effort"]}'], { CLAUDE_CONFIG_DIR: configDir })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(readFileSync(join(data, 'config.json'), 'utf8')).fields, ['effort'])
    assert.equal(render(join(data, 'statusline-command.sh')), '⚡ high')
  })

  it('going back to defaults drops the saved config', () => {
    const { data, configDir } = sandbox()
    const env = { CLAUDE_CONFIG_DIR: configDir }
    cli(['install', '--data', data, '--config', '{"fields":["effort"]}'], env)
    cli(['install', '--data', data], env)
    assert.equal(existsSync(join(data, 'config.json')), false)
  })

  it('uninstall removes only our statusLine and keeps other settings', () => {
    const { data, configDir } = sandbox()
    const settingsFile = join(configDir, 'settings.json')
    const env = { CLAUDE_CONFIG_DIR: configDir }
    cli(['install', '--data', data], env)
    const installed = JSON.parse(readFileSync(settingsFile, 'utf8'))
    writeFileSync(settingsFile, JSON.stringify({ ...installed, theme: 'dark' }))
    assert.equal(cli(['uninstall', '--data', data], env).status, 0)
    assert.deepEqual(JSON.parse(readFileSync(settingsFile, 'utf8')), { theme: 'dark' })
  })

  it('creates settings.json as 0600 and preserves an existing mode', () => {
    const { data, configDir } = sandbox()
    const settingsFile = join(configDir, 'settings.json')
    const env = { CLAUDE_CONFIG_DIR: configDir }
    cli(['install', '--data', data], env)
    assert.equal(statSync(settingsFile).mode & 0o777, 0o600)
    chmodSync(settingsFile, 0o640)
    cli(['uninstall', '--data', data], env)
    assert.equal(statSync(settingsFile).mode & 0o777, 0o640)
  })

  it('uninstall without a settings file is a no-op', () => {
    const { data, configDir } = sandbox()
    const result = cli(['uninstall', '--data', data], { CLAUDE_CONFIG_DIR: configDir })
    assert.equal(result.status, 0)
    assert.equal(existsSync(join(configDir, 'settings.json')), false)
  })
})

describe('cli detect-oauth', () => {
  it('prints true or false', () => {
    assert.match(cli(['detect-oauth']).stdout.trim(), /^(true|false)$/)
  })
})
