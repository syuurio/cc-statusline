import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SYNC = join(ROOT, 'scripts', 'sync.sh')
const DEFAULT_SCRIPT = readFileSync(join(ROOT, 'src', 'statusline-command.sh'), 'utf8')
const SYSTEM_PATH = '/bin:/usr/bin'

function sync(data, path = `${dirname(process.execPath)}:${SYSTEM_PATH}`) {
  return spawnSync('sh', [SYNC, ROOT, data], { encoding: 'utf8', env: { PATH: path } })
}

function freshData() {
  return join(mkdtempSync(join(tmpdir(), 'cc-sync-')), 'data')
}

describe('sync.sh', () => {
  it('copies the default script when there is no config, silently', () => {
    const data = freshData()
    const result = sync(data)
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''])
    const script = join(data, 'statusline-command.sh')
    assert.equal(readFileSync(script, 'utf8'), DEFAULT_SCRIPT)
    assert.equal(statSync(script).mode & 0o777, 0o755)
  })

  it('regenerates from config.json when node is available', () => {
    const data = freshData()
    mkdirSync(data, { recursive: true })
    writeFileSync(join(data, 'config.json'), JSON.stringify({ fields: ['effort'] }))
    const result = sync(data)
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''])
    const script = readFileSync(join(data, 'statusline-command.sh'), 'utf8')
    assert.match(script, /effort=\$\(_jq '\.effort\.level/)
    assert.doesNotMatch(script, /model=\$\(_jq/)
  })

  it('keeps the existing script when config.json exists but node does not', () => {
    const data = freshData()
    mkdirSync(data, { recursive: true })
    writeFileSync(join(data, 'config.json'), JSON.stringify({ fields: ['effort'] }))
    writeFileSync(join(data, 'statusline-command.sh'), 'custom')
    const result = sync(data, SYSTEM_PATH)
    assert.deepEqual([result.status, result.stdout, result.stderr], [0, '', ''])
    assert.equal(readFileSync(join(data, 'statusline-command.sh'), 'utf8'), 'custom')
  })

  it('is idempotent and leaves no temp files behind', () => {
    const data = freshData()
    sync(data)
    sync(data)
    assert.deepEqual(readdirSync(data), ['statusline-command.sh'])
    assert.equal(readFileSync(join(data, 'statusline-command.sh'), 'utf8'), DEFAULT_SCRIPT)
  })
})
