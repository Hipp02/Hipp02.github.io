const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')
const http = require('node:http')
const { ensureLinuxDesktop } = require('./linux-desktop-runtime')

const port = Number(process.env.BROWSER_PORT || 3001)
process.env.SAND_PORT = String(port)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('BROWSER_PORT must be a valid TCP port number.')
  process.exit(1)
}

const previousContainer = spawnSync('docker', [
  'inspect', '--format', '{{.State.Running}}', 'sand-chromium'
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

if (previousContainer.status === 0 && previousContainer.stdout.trim() === 'true') {
  const stopped = spawnSync('docker', ['stop', 'sand-chromium'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (stopped.status !== 0) {
    console.error(`Could not stop the old streamed desktop: ${stopped.stderr.trim()}`)
    process.exit(1)
  }
}

function checkDesktop() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/`, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve(
        response.statusCode === 200 && body.includes('<title>Sand Linux Desktop</title>')
      ))
    })
    request.setTimeout(1500, () => request.destroy())
    request.on('error', () => resolve(false))
  })
}

async function startDesktop() {
  ensureLinuxDesktop().catch((error) => {
    console.error(error.message)
  })

  if (await checkDesktop()) {
    console.log(`Sand Desktop is already running on port ${port}.`)
    return
  }

  const child = spawn(process.execPath, [path.join(__dirname, 'web-server.js')], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: String(port) }
  })
  child.once('error', (error) => {
    console.error(`Could not start Sand Desktop: ${error.message}`)
    process.exitCode = 1
  })
  child.unref()

  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (await checkDesktop()) {
      console.log(`Sand Desktop is ready on port ${port}. Keep the forwarded port private.`)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  console.error(`Sand Desktop did not become ready on port ${port}.`)
  process.exitCode = 1
}

startDesktop().catch((error) => {
  console.error(`Could not start Sand Desktop: ${error.message}`)
  process.exitCode = 1
})
