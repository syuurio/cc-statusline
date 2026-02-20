export function applyStatusLine(rawJson, scriptPath) {
  const settings = JSON.parse(rawJson)
  settings.statusLine = { type: 'command', command: `bash "${scriptPath}"` }
  return JSON.stringify(settings, null, 2) + '\n'
}
