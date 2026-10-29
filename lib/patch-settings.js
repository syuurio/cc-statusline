// Plugins cannot set statusLine, and nothing runs on uninstall, so the command
// must stay harmless once the plugin data dir (and the script) is deleted.
export function statusLineCommand(scriptPath) {
  const quoted = `'${scriptPath.replace(/'/g, `'\\''`)}'`
  return `f=${quoted}; [ ! -f "$f" ] || exec bash "$f"`
}

export function applyStatusLine(rawJson, scriptPath) {
  const settings = JSON.parse(rawJson)
  settings.statusLine = { type: 'command', command: statusLineCommand(scriptPath) }
  return JSON.stringify(settings, null, 2) + '\n'
}

export function removeStatusLine(rawJson, scriptPath) {
  const settings = JSON.parse(rawJson)
  if (settings.statusLine?.command?.includes(scriptPath)) delete settings.statusLine
  return JSON.stringify(settings, null, 2) + '\n'
}
