const { spawn, spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const containerName = 'sand-chromium'
const profileVolume = 'sand-chromium-profile'
const archiveImage = 'alpine:3.21'
const backupDirectory = path.join(__dirname, '.sand-backups')
const magic = Buffer.from('SANDPRF1')
const saltLength = 16
const ivLength = 12
const tagLength = 16
const headerLength = magic.length + saltLength + ivLength

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    ...options
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `docker ${args[0]} failed.`)
  }
  return result.stdout?.trim() || ''
}

function ensureDocker() {
  docker(['version'], { stdio: ['ignore', 'ignore', 'pipe'] })
  try {
    docker(['volume', 'inspect', profileVolume], { stdio: ['ignore', 'ignore', 'ignore'] })
  } catch {
    docker(['volume', 'create', profileVolume])
  }
}

function browserIsRunning() {
  const result = spawnSync('docker', [
    'inspect', '--format', '{{.State.Running}}', containerName
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return result.status === 0 && result.stdout.trim() === 'true'
}

function stopBrowser(wasRunning) {
  if (wasRunning) docker(['stop', '--time', '30', containerName])
}

function restartBrowser(wasRunning) {
  if (!wasRunning) return
  const result = spawnSync(process.execPath, [path.join(__dirname, 'start-background.js')], {
    stdio: 'inherit',
    timeout: 130000
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Sand did not restart successfully.')
}

function readSecret(prompt) {
  const input = process.stdin
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command in an interactive terminal to enter the backup passphrase securely.'))
  }

  process.stdout.write(prompt)
  const previousRawMode = input.isRaw
  input.setRawMode(true)
  input.resume()

  return new Promise((resolve, reject) => {
    let value = ''
    const finish = (error) => {
      input.removeListener('data', onData)
      input.setRawMode(previousRawMode)
      input.pause()
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') return finish(new Error('Cancelled.'))
        if (character === '\r' || character === '\n') return finish()
        if (character === '\u007f' || character === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        if (character >= ' ') {
          value += character
          process.stdout.write('*')
        }
      }
    }
    input.on('data', onData)
  })
}

async function newPassphrase() {
  const passphrase = await readSecret('Create backup passphrase (12+ characters): ')
  if (Buffer.byteLength(passphrase) < 12) {
    throw new Error('Use a passphrase of at least 12 characters.')
  }
  const confirmation = await readSecret('Confirm backup passphrase: ')
  if (passphrase !== confirmation) throw new Error('Passphrases did not match.')
  return passphrase
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32, {
    N: 1 << 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  })
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function createBackup(passphrase, label = 'profile') {
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 })
  fs.chmodSync(backupDirectory, 0o700)
  const archivePath = path.join(backupDirectory, `sand-${label}-${timestamp()}.sand`)
  const salt = crypto.randomBytes(saltLength)
  const iv = crypto.randomBytes(ivLength)
  const key = deriveKey(passphrase, salt)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const header = Buffer.concat([magic, salt, iv])
  const output = fs.createWriteStream(archivePath, { flags: 'wx', mode: 0o600 })
  output.write(header)

  const appendTag = new Transform({
    transform(chunk, encoding, callback) {
      callback(null, chunk)
    },
    flush(callback) {
      callback(null, cipher.getAuthTag())
    }
  })
  const tar = spawn('docker', [
    'run', '--rm',
    '--volume', `${profileVolume}:/profile:ro`,
    archiveImage,
    'tar', '-czf', '-', '-C', '/profile', '.'
  ], { stdio: ['ignore', 'pipe', 'inherit'] })

  const tarExited = new Promise((resolve) => {
    tar.once('close', (code, signal) => resolve({ code, signal }))
    tar.once('error', (error) => resolve({ error }))
  })

  try {
    const [, result] = await Promise.all([
      pipeline(tar.stdout, cipher, appendTag, output),
      tarExited
    ])
    if (result.error) throw result.error
    if (result.code !== 0) throw new Error(`Profile archive failed${result.signal ? ` (${result.signal})` : ''}.`)
    return archivePath
  } catch (error) {
    tar.kill('SIGTERM')
    fs.rmSync(archivePath, { force: true })
    throw error
  }
}

function inspectArchive(archivePath, passphrase) {
  const stats = fs.statSync(archivePath)
  if (stats.size <= headerLength + tagLength) throw new Error('Backup file is incomplete.')

  const descriptor = fs.openSync(archivePath, 'r')
  try {
    const header = Buffer.alloc(headerLength)
    const tag = Buffer.alloc(tagLength)
    fs.readSync(descriptor, header, 0, header.length, 0)
    fs.readSync(descriptor, tag, 0, tag.length, stats.size - tagLength)
    if (!header.subarray(0, magic.length).equals(magic)) {
      throw new Error('This is not a supported Sand profile backup.')
    }
    const saltStart = magic.length
    const ivStart = saltStart + saltLength
    const salt = header.subarray(saltStart, ivStart)
    const iv = header.subarray(ivStart, headerLength)
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv)
    decipher.setAuthTag(tag)
    return { decipher, size: stats.size }
  } finally {
    fs.closeSync(descriptor)
  }
}

async function extractToStagingVolume(archivePath, passphrase, stagingVolume) {
  const { decipher, size } = inspectArchive(archivePath, passphrase)
  docker(['volume', 'create', stagingVolume])
  const extractor = spawn('docker', [
    'run', '--rm', '--interactive',
    '--volume', `${stagingVolume}:/restore`,
    archiveImage,
    'tar', '-xzf', '-', '-C', '/restore'
  ], { stdio: ['pipe', 'ignore', 'inherit'] })
  const extractorExited = new Promise((resolve) => {
    extractor.once('close', (code, signal) => resolve({ code, signal }))
    extractor.once('error', (error) => resolve({ error }))
  })
  const encryptedData = fs.createReadStream(archivePath, {
    start: headerLength,
    end: size - tagLength - 1
  })

  try {
    const [, result] = await Promise.all([
      pipeline(encryptedData, decipher, extractor.stdin),
      extractorExited
    ])
    if (result.error) throw result.error
    if (result.code !== 0) throw new Error('Backup could not be decrypted and extracted. Check the passphrase and file.')
  } catch (error) {
    extractor.kill('SIGTERM')
    throw error
  }
}

function replaceProfile(stagingVolume) {
  docker([
    'run', '--rm',
    '--volume', `${profileVolume}:/target`,
    '--volume', `${stagingVolume}:/source:ro`,
    archiveImage,
    'sh', '-ec',
    'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} \\; && cp -a /source/. /target/'
  ], { stdio: 'inherit' })
}

async function withBrowserStopped(action) {
  const wasRunning = browserIsRunning()
  stopBrowser(wasRunning)
  try {
    return await action()
  } finally {
    restartBrowser(wasRunning)
  }
}

async function backup() {
  const passphrase = await newPassphrase()
  const archivePath = await withBrowserStopped(() => createBackup(passphrase))
  console.log(`Encrypted profile backup created: ${archivePath}`)
  console.log('Copy this file somewhere private outside the Codespace for disaster recovery.')
}

async function restore(archivePath) {
  if (!archivePath) throw new Error('Provide the backup file path after the restore command.')
  archivePath = path.resolve(archivePath)
  if (!fs.existsSync(archivePath)) throw new Error(`Backup file not found: ${archivePath}`)
  const passphrase = await readSecret('Backup passphrase: ')
  const stagingVolume = `sand-restore-${crypto.randomBytes(8).toString('hex')}`

  await withBrowserStopped(async () => {
    const safetyBackup = await createBackup(passphrase, 'before-restore')
    console.log(`Current profile safety backup: ${safetyBackup}`)
    try {
      await extractToStagingVolume(archivePath, passphrase, stagingVolume)
      replaceProfile(stagingVolume)
      console.log('Profile restored successfully.')
    } finally {
      spawnSync('docker', ['volume', 'rm', stagingVolume], { stdio: 'ignore' })
    }
  })
}

async function main() {
  const action = process.argv[2]
  ensureDocker()
  if (action === 'backup') return backup()
  if (action === 'restore') return restore(process.argv[3])
  throw new Error('Choose either the backup or restore action.')
}

main().catch((error) => {
  console.error(`Profile backup failed: ${error.message}`)
  process.exitCode = 1
})