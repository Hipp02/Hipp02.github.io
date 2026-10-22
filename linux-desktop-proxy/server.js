const http = require('node:http')

const port = Number(process.env.DESKTOP_PORT || 3002)
const sandPort = Number(process.env.SAND_PORT || 3001)
const webtopHost = 'linux-desktop'
const webtopPort = 3000
const codespaces = process.env.CODESPACES === 'true'

function getSandOrigins() {
  if (codespaces) {
    const name = process.env.CODESPACE_NAME
    const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    if (!name || !domain) {
      throw new Error('Codespaces desktop frame configuration is missing.')
    }
    return [`https://${name}-${sandPort}.${domain}`]
  }
  return [`http://localhost:${sandPort}`, `http://127.0.0.1:${sandPort}`]
}

function updateFrameAncestors(header) {
  const origins = getSandOrigins()
  const policies = Array.isArray(header) ? header : [header || '']
  return policies.map((policy) => {
    const directives = policy.split(';').map((directive) => directive.trim()).filter(Boolean)
    const frameAncestorsIndex = directives.findIndex((directive) =>
      directive.split(/\s+/, 1)[0].toLowerCase() === 'frame-ancestors'
    )
    const frameAncestors = `frame-ancestors 'self' ${origins.join(' ')}`
    if (frameAncestorsIndex === -1) directives.push(frameAncestors)
    else directives[frameAncestorsIndex] = frameAncestors
    return directives.join('; ')
  })
}

function proxyRequest(request, response) {
  const upstream = http.request({
    hostname: webtopHost,
    port: webtopPort,
    method: request.method,
    path: request.url,
    headers: {
      ...request.headers,
      'x-forwarded-host': request.headers.host,
      'x-forwarded-proto': codespaces ? 'https' : 'http'
    }
  }, (upstreamResponse) => {
    const headers = { ...upstreamResponse.headers }
    delete headers['x-frame-options']
    headers['content-security-policy'] = updateFrameAncestors(
      headers['content-security-policy']
    )
    response.writeHead(upstreamResponse.statusCode || 502, headers)
    upstreamResponse.pipe(response)
  })

  upstream.on('error', (error) => {
    console.error(`Could not reach the Linux desktop: ${error.message}`)
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('The Linux desktop is not available. Check that its container is running.')
  })
  request.pipe(upstream)
}

const server = http.createServer(proxyRequest)
server.on('upgrade', (request, socket, head) => {
  const upstream = http.request({
    hostname: webtopHost,
    port: webtopPort,
    method: request.method,
    path: request.url,
    headers: {
      ...request.headers,
      'x-forwarded-host': request.headers.host,
      'x-forwarded-proto': codespaces ? 'https' : 'http'
    }
  })

  upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
    socket.write(
      `HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` +
      Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`).join('\r\n') +
      '\r\n\r\n'
    )
    if (upstreamHead.length > 0) socket.write(upstreamHead)
    if (head.length > 0) upstreamSocket.write(head)
    socket.pipe(upstreamSocket)
    upstreamSocket.pipe(socket)
    socket.on('error', () => upstreamSocket.destroy())
    upstreamSocket.on('error', () => socket.destroy())
  })
  upstream.on('response', (response) => {
    socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n\r\n`)
    socket.end()
  })
  upstream.on('error', (error) => {
    console.error(`Could not connect the Linux desktop stream: ${error.message}`)
    socket.destroy()
  })
  upstream.end()
})

server.on('error', (error) => {
  console.error('Could not start the Linux desktop proxy:', error.message)
  process.exitCode = 1
})
server.listen(port, '0.0.0.0', () => {
  console.log(`Sand Linux desktop proxy is listening on port ${port}`)
})
