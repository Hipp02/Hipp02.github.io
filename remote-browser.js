process.env.PORT = process.env.BROWSER_PORT || '3001'
process.env.SAND_PORT = process.env.PORT
require('./linux-desktop-runtime').ensureLinuxDesktop().catch((error) => {
  console.error(error.message)
})
require('./web-server')
