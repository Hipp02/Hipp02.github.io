const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function ensureLinuxDesktop() {
  const composeFile = path.join(__dirname, 'docker-compose.yml')
  const configDirectory = path.join(__dirname, '.sand-desktop')
  try {
    fs.mkdirSync(configDirectory, { recursive: true, mode: 0o700 })
  } catch (error) {
    return Promise.reject(new Error(`Could not create the persistent Linux desktop directory: ${error.message}`))
  }

  return new Promise((resolve, reject) => {
    const child = spawn('docker', [
    'compose', '-f', composeFile, 'up', '--detach', '--build'
    ], { stdio: 'inherit' })

    child.once('error', (error) => {
      reject(new Error(`Could not start the Linux desktop: ${error.message}`))
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`Could not start the Linux desktop: Docker Compose exited with ${signal || `status ${code}`}.`))
    })
  })
}

module.exports = { ensureLinuxDesktop }
