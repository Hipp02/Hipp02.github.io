const addressForm = document.querySelector('#address-form')
const addressInput = document.querySelector('#address')
const statusCopy = document.querySelector('#status-copy')
const connectionMark = document.querySelector('#connection-mark')
const appStatus = document.querySelector('#app-status')
const proxyDialog = document.querySelector('#proxy-dialog')
const extensionsDialog = document.querySelector('#extensions-dialog')
const extensionList = document.querySelector('#extension-list')
const extensionCount = document.querySelector('#extension-count')
let statusTimer

function showStatus(message, isError = false) {
  appStatus.textContent = message
  appStatus.classList.toggle('is-error', isError)
  appStatus.classList.add('is-visible')
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => appStatus.classList.remove('is-visible'), 3600)
}

function setExtensions(extensions) {
  extensionList.replaceChildren()
  extensionCount.textContent = String(extensions.length)
  if (extensions.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty-list'
    empty.textContent = 'No extensions loaded'
    extensionList.append(empty)
    return
  }

  for (const extension of extensions) {
    const item = document.createElement('li')
    const name = document.createElement('span')
    const version = document.createElement('small')
    name.textContent = extension.name
    version.textContent = `v${extension.version}`
    item.append(name, version)
    extensionList.append(item)
  }
}

document.querySelector('#back').addEventListener('click', () => window.sand.back())
document.querySelector('#forward').addEventListener('click', () => window.sand.forward())
document.querySelector('#reload').addEventListener('click', () => window.sand.reload())

addressForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    await window.sand.navigate(addressInput.value)
    addressInput.blur()
  } catch (error) {
    showStatus(error.message, true)
  }
})

document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault()
  window.sand.navigate('https://duckduckgo.com').catch((error) => showStatus(error.message, true))
})

document.querySelector('#proxy-open').addEventListener('click', () => proxyDialog.showModal())
document.querySelector('#extensions-open').addEventListener('click', async () => {
  extensionsDialog.showModal()
  try {
    setExtensions(await window.sand.getExtensions())
  } catch (error) {
    document.querySelector('#extension-error').textContent = error.message
  }
})

document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => document.getElementById(button.dataset.close).close())
})

document.querySelector('#proxy-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const errorElement = document.querySelector('#proxy-error')
  errorElement.textContent = ''
  try {
    const result = await window.sand.setProxy(document.querySelector('#proxy-url').value)
    showStatus(result)
    proxyDialog.close()
  } catch (error) {
    errorElement.textContent = error.message
  }
})

document.querySelector('#proxy-direct').addEventListener('click', async () => {
  const errorElement = document.querySelector('#proxy-error')
  errorElement.textContent = ''
  try {
    showStatus(await window.sand.setProxy(''))
    document.querySelector('#proxy-url').value = ''
    proxyDialog.close()
  } catch (error) {
    errorElement.textContent = error.message
  }
})

document.querySelector('#extension-load').addEventListener('click', async () => {
  const errorElement = document.querySelector('#extension-error')
  errorElement.textContent = ''
  try {
    const extension = await window.sand.loadExtension()
    if (extension) showStatus(`Loaded ${extension.name}`)
    setExtensions(await window.sand.getExtensions())
  } catch (error) {
    errorElement.textContent = error.message
  }
})

window.sand.onState((state) => {
  if (document.activeElement !== addressInput) addressInput.value = state.url
  document.querySelector('#back').disabled = !state.canGoBack
  document.querySelector('#forward').disabled = !state.canGoForward
  connectionMark.classList.toggle('is-secure', state.secure)
  connectionMark.title = state.secure ? 'HTTPS connection' : 'Connection is not HTTPS'
  statusCopy.textContent = state.loading
    ? 'Loading in an isolated session...'
    : state.secure
      ? 'HTTPS connection · session data clears when you quit'
      : state.url
        ? 'Not encrypted · session data clears when you quit'
        : 'Private session · data clears when you quit'
})