const desktopFrame = document.querySelector('#linux-desktop')
const status = document.querySelector('#connection-status')
const statusMessage = document.querySelector('#status-message')
const retryButton = document.querySelector('#retry')
let connectionTimeout

function showStatus(message, canRetry = false) {
  statusMessage.textContent = message
  retryButton.hidden = !canRetry
  status.hidden = false
}

async function openDesktop() {
  clearTimeout(connectionTimeout)
  retryButton.hidden = true
  showStatus('Starting your Linux desktop…')

  try {
    const response = await fetch('/desktop-config.json', { cache: 'no-store' })
    const config = await response.json()
    if (!response.ok) throw new Error(config.error || 'The Linux desktop is unavailable.')

    const desktopUrl = new URL(config.url, window.location.origin)
    if (!['http:', 'https:'].includes(desktopUrl.protocol) ||
        desktopUrl.username || desktopUrl.password) {
      throw new Error('The Linux desktop address is invalid.')
    }
    if (desktopUrl.origin !== window.location.origin) {
      throw new Error('The Linux desktop must use the Sand site connection.')
    }

    desktopFrame.src = desktopUrl.href
    connectionTimeout = setTimeout(() => {
      showStatus('The Linux desktop is taking longer than expected to load. Check that the Codespace is running, then retry.', true)
    }, 30000)
  } catch (error) {
    showStatus(error.message || 'Could not connect to the Linux desktop.', true)
  }
}

desktopFrame.addEventListener('load', () => {
  clearTimeout(connectionTimeout)
  status.hidden = true
})
retryButton.addEventListener('click', openDesktop)

openDesktop()
