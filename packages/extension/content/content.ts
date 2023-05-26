/*

Constent Script

This script is injected into every page and is responsible for:

- Forwarding messages between the background script and the debugger
- Injecting the real-world script to detect if solid is on the page (and the debugger if so)

*/

import { error, log } from '@solid-devtools/shared/utils'
import {
  ConnectionName,
  DETECT_MESSAGE,
  ForwardPayload,
  createPortMessanger,
  forwardMessageToWindow,
  isForwardMessage,
  makeMessageListener,
  makePostMessage,
  startListeningWindowMessages,
} from '../src/bridge'

import.meta.env.DEV && log('Content-Script working.')

// @ts-expect-error ?script&module query ensures output in ES module format and only import the script path
import realWorld from './real-world?script&module'

const extVersion = chrome.runtime.getManifest().version

const port = chrome.runtime.connect({ name: ConnectionName.Content })

let devtoolsOpened = false

startListeningWindowMessages()
const fromClient = makeMessageListener()
const toClient = makePostMessage()

const { postPortMessage: toBackground, onPortMessage: fromBackground } = createPortMessanger(port)

{
  // Evaluate the real-world script to detect if solid is on the page
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL(realWorld)
  script.type = 'module'
  script.addEventListener('error', err => error('Real world script failed to load.', err))
  document.head.append(script)
  window.addEventListener('message', e => {
    if (e.data && typeof e.data === 'object' && e.data.name === DETECT_MESSAGE) {
      toBackground('Detected', e.data.state)
    }
  })
}

fromClient('ClientConnected', versions => {
  // eslint-disable-next-line no-console
  console.log(
    '🚧 %csolid-devtools%c is in early development! 🚧\nPlease report any bugs to https://github.com/thetarnav/solid-devtools/issues',
    'color: #fff; background: rgba(181, 111, 22, 0.7); padding: 1px 4px;',
    'color: #e38b1b',
  )

  toBackground('Versions', {
    client: versions.client,
    solid: versions.solid,
    extension: extVersion,
    expectedClient: import.meta.env.EXPECTED_CLIENT,
  })

  fromClient('ResetPanel', () => toBackground('ResetPanel'))

  if (devtoolsOpened) toClient('DevtoolsOpened')
})

// After page reload, the content script is reloaded but the background script is not.
// This means that 'DevtoolsOpened' message will come after the Client is setup.
// We need to send it after it connects.
fromBackground('DevtoolsOpened', () => {
  devtoolsOpened = true
  toClient('DevtoolsOpened')
})
fromBackground('DevtoolsClosed', () => toClient('DevtoolsClosed'))

fromClient(e => {
  // forward all client messages to the background script in
  const payload: ForwardPayload = { forwarding: true, name: e.name, details: e.details }
  port.postMessage(payload)
})

port.onMessage.addListener(data => {
  // forward all devtools messages (from background) to the client
  if (isForwardMessage(data)) forwardMessageToWindow(data)
})
