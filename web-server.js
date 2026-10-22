const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const port = Number(process.env.PORT || process.env.BROWSER_PORT || 3000)
const desktopProxyPort = 3010
const host = process.env.HOST || (process.env.CODESPACES === 'true' ? '0.0.0.0' : '127.0.0.1')
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/desktop.js', ['desktop.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
])
const webRoot = path.join(__dirname, 'web')

function getDesktopUrl() {
  return '/linux/'
}

function getDesktopPath(requestUrl) {
  const { pathname, search } = new URL(requestUrl, 'http://localhost')
  const path = pathname.replace(/^\/linux(?=\/|$)/, '') || '/'
  return `${path}${search}`
}

function proxyDesktopRequest(request, response) {
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: desktopProxyPort,
    method: request.method,
    path: getDesktopPath(request.url),
    headers: request.headers
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })

  upstream.on('error', (error) => {
    console.error(`Could not reach the Linux desktop: ${error.message}`)
    if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('The Linux desktop is not available. Check that its container is running.')
  })
  request.pipe(upstream)
}

function proxyDesktopUpgrade(request, socket, head) {
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: desktopProxyPort,
    method: request.method,
    path: getDesktopPath(request.url),
    headers: request.headers
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
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname === '/linux' || pathname.startsWith('/linux/')) {
    proxyDesktopRequest(request, response)
    return
  }
  if (pathname === '/desktop-config.json' && request.method === 'GET') {
    let desktopUrl
    try {
      desktopUrl = getDesktopUrl()
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: error.message }))
      return
    }
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    })
    response.end(JSON.stringify({ url: desktopUrl }))
    return
  }

  const resource = files.get(pathname)
  if (!resource || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(resource ? 405 : 404, { Allow: 'GET, HEAD' })
    response.end()
    return
  }

  const [fileName, contentType] = resource
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src https: http:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(), screen-wake-lock=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store'
  })

  if (request.method === 'HEAD') {
    response.end()
    return
  }
  fs.createReadStream(path.join(webRoot, fileName)).pipe(response)
})
server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url, 'http://localhost').pathname.startsWith('/linux/')) {
    proxyDesktopUpgrade(request, socket, head)
    return
  }
  socket.destroy()
})

server.listen(port, host, () => {
  console.log(`Sand is listening on http://${host}:${port}`)
})

server.on('error', (error) => {
  console.error('Could not start Sand:', error.message)
  process.exitCode = 1
})