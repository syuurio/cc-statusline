import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyStatusLine, removeStatusLine, statusLineCommand } from '../lib/patch-settings.js'

function runCommand(command) {
  const result = spawnSync('sh', ['-c', command], { input: '{}', encoding: 'utf8' })
  return { stdout: result.stdout, stderr: result.stderr, status: result.status }
}

describe('statusLineCommand', () => {
  it('runs the script when it exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-sl-'))
    const script = join(dir, 'statusline-command.sh')
    writeFileSync(script, 'cat >/dev/null; printf hello')
    assert.deepEqual(runCommand(statusLineCommand(script)), { stdout: 'hello', stderr: '', status: 0 })
  })

  it('prints nothing and exits 0 once the script is gone', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'cc-sl-')), 'statusline-command.sh')
    assert.deepEqual(runCommand(statusLineCommand(missing)), { stdout: '', stderr: '', status: 0 })
  })

  it('handles spaces and single quotes in the path', () => {
    const dir = mkdtempSync(join(tmpdir(), "cc sl 'q'-"))
    const script = join(dir, 'statusline-command.sh')
    writeFileSync(script, 'cat >/dev/null; printf ok')
    assert.equal(runCommand(statusLineCommand(script)).stdout, 'ok')
  })
})

describe('applyStatusLine', () => {
  it('adds statusLine and keeps other keys', () => {
    const result = JSON.parse(applyStatusLine(JSON.stringify({ theme: 'dark' }), '/data/statusline-command.sh'))
    assert.equal(result.theme, 'dark')
    assert.deepEqual(result.statusLine, {
      type: 'command',
      command: statusLineCommand('/data/statusline-command.sh'),
    })
  })

  it('overwrites an existing statusLine', () => {
    const input = JSON.stringify({ statusLine: { type: 'command', command: 'bash /old/script.sh', padding: 1 } })
    const result = JSON.parse(applyStatusLine(input, '/new/statusline-command.sh'))
    assert.equal(result.statusLine.command, statusLineCommand('/new/statusline-command.sh'))
  })

  it('throws on malformed JSON', () => {
    assert.throws(() => applyStatusLine('not json', '/path'), { name: 'SyntaxError' })
  })

  it('writes pretty-printed JSON ending with a newline', () => {
    const result = applyStatusLine('{}', '/path/to/script.sh')
    assert.ok(result.includes('  "statusLine"'))
    assert.ok(result.endsWith('\n'))
  })
})

describe('removeStatusLine', () => {
  it('removes a statusLine that points at our script', () => {
    const installed = applyStatusLine(JSON.stringify({ theme: 'dark' }), '/data/statusline-command.sh')
    assert.deepEqual(JSON.parse(removeStatusLine(installed, '/data/statusline-command.sh')), { theme: 'dark' })
  })

  it('leaves a statusLine owned by something else', () => {
    const input = JSON.stringify({ statusLine: { type: 'command', command: 'my-own-statusline' } })
    assert.deepEqual(JSON.parse(removeStatusLine(input, '/data/statusline-command.sh')), JSON.parse(input))
  })

  it('is a no-op without a statusLine', () => {
    assert.deepEqual(JSON.parse(removeStatusLine('{"a":1}', '/data/statusline-command.sh')), { a: 1 })
  })
})
