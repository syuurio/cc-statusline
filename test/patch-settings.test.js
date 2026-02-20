import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyStatusLine } from '../lib/patch-settings.js'

describe('applyStatusLine', () => {
  it('empty object → adds statusLine', () => {
    const result = JSON.parse(applyStatusLine('{}', '/path/to/script.sh'))
    assert.deepStrictEqual(result.statusLine, {
      type: 'command',
      command: 'bash "/path/to/script.sh"',
    })
  })

  it('existing settings → adds without losing other keys', () => {
    const input = JSON.stringify({ theme: 'dark', editor: 'vim' })
    const result = JSON.parse(applyStatusLine(input, '/path/to/script.sh'))
    assert.equal(result.theme, 'dark')
    assert.equal(result.editor, 'vim')
    assert.deepStrictEqual(result.statusLine, {
      type: 'command',
      command: 'bash "/path/to/script.sh"',
    })
  })

  it('existing statusLine → overwrites', () => {
    const input = JSON.stringify({
      statusLine: { type: 'command', command: 'bash /old/script.sh' },
    })
    const result = JSON.parse(applyStatusLine(input, '/new/script.sh'))
    assert.deepStrictEqual(result.statusLine, {
      type: 'command',
      command: 'bash "/new/script.sh"',
    })
  })

  it('malformed JSON → throws', () => {
    assert.throws(() => applyStatusLine('not json', '/path'), {
      name: 'SyntaxError',
    })
  })

  it('output ends with newline', () => {
    const result = applyStatusLine('{}', '/path/to/script.sh')
    assert.ok(result.endsWith('\n'))
  })

  it('output is pretty-printed with 2-space indent', () => {
    const result = applyStatusLine('{}', '/path/to/script.sh')
    assert.ok(result.includes('  "statusLine"'))
  })

  it('path with spaces is quoted in command', () => {
    const result = JSON.parse(applyStatusLine('{}', '/path/with spaces/script.sh'))
    assert.equal(result.statusLine.command, 'bash "/path/with spaces/script.sh"')
  })
})
