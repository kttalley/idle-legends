// Headless CDP validation for idle/manual control mode switching.
// Connects to the existing dev Chrome on port 9234 and runs against localhost:5173.

const APP_URL = 'http://localhost:5173/projects/idle-legends/'
const WS_VERSION_URL = 'http://localhost:9234/json/version'
const WS_LIST_URL = 'http://localhost:9234/json/list'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function getBrowserWsUrl() {
  const res = await fetch(WS_VERSION_URL)
  const json = await res.json()
  return json.webSocketDebuggerUrl
}

async function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const handlers = []

  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  ws.onerror = null

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
    for (const h of handlers) h(msg)
  }

  const send = (method, params = {}) => {
    id += 1
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
    })
    ws.send(JSON.stringify({ id, method, params }))
    return promise
  }

  return { send, on: (fn) => handlers.push(fn), close: () => ws.close() }
}

async function clickButton(client, predicate) {
  const res = await client.send('Runtime.evaluate', {
    expression: `
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(${predicate.toString()});
      if (b) {
        b.scrollIntoView({ block: 'center' });
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        b.click();
        b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      }
      !!b
    `,
    returnByValue: true,
  })
  return res.result.value
}

async function queryMode(client) {
  const res = await client.send('Runtime.evaluate', {
    expression: `
      const btn = document.querySelector('button[aria-label="Manual control"], button[aria-label="Idle auto-pilot"]');
      btn ? { manual: btn.getAttribute('aria-pressed') === 'true', title: btn.title } : null
    `,
    returnByValue: true,
  })
  return res.result.value
}

async function dispatchKey(client, key) {
  await client.send('Runtime.evaluate', {
    expression: `
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '${key}', bubbles: true }));
    `,
  })
}

async function sceneMounted(client) {
  const res = await client.send('Runtime.evaluate', {
    expression: '!!window.__ilScene',
    returnByValue: true,
  })
  return res.result.value
}

async function waitForLoad(client) {
  await client.send('Page.enable')
  let resolveLoad
  const loadPromise = new Promise(r => { resolveLoad = r })
  client.on((msg) => {
    if (msg.method === 'Page.loadEventFired') resolveLoad()
  })
  await client.send('Page.navigate', { url: APP_URL })
  await loadPromise
}

let client

async function main() {
  const browser = await cdpClient(await getBrowserWsUrl())
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  await sleep(200)

  const listRes = await fetch(WS_LIST_URL)
  const tabs = await listRes.json()
  const tab = tabs.find(t => t.id === targetId)
  if (!tab || !tab.webSocketDebuggerUrl) throw new Error('Could not find new tab debugger URL')

  client = await cdpClient(tab.webSocketDebuggerUrl)
  await client.send('Runtime.enable')

  console.log('Loading', APP_URL)
  await waitForLoad(client)
  await sleep(800) // let React hydrate

  // Clear any existing save slot so the test starts at character creation.
  await client.send('Runtime.evaluate', {
    expression: "localStorage.removeItem('idle_legends_saves_v1')",
  })
  await client.send('Page.reload', { ignoreCache: true })
  await sleep(1200)

  // Click "Begin Your Legend" if we're on character creation.
  let attempts = 0
  while (attempts < 20) {
    const found = await clickButton(client, b => b.textContent.includes('Begin'))
    if (found) {
      console.log('Clicked Begin Your Legend')
      break
    }
    await sleep(500)
    attempts++
  }

  // If that didn't start the game, we may be on the select screen — click Continue.
  attempts = 0
  while (attempts < 10) {
    if (await sceneMounted(client)) break
    const found = await clickButton(client, b => b.textContent.includes('Continue'))
    if (found) {
      console.log('Clicked Continue on select screen')
      break
    }
    await sleep(500)
    attempts++
  }

  // Wait for world scene.
  attempts = 0
  while (attempts < 30) {
    if (await sceneMounted(client)) {
      console.log('World scene mounted')
      break
    }
    await sleep(500)
    attempts++
  }
  if (!(await sceneMounted(client))) throw new Error('World scene did not mount')

  let mode = await queryMode(client)
  console.log('Initial mode:', mode)
  if (!mode || mode.manual) throw new Error('Expected idle initially')

  const toggleFound = await clickButton(client, b => b.getAttribute('aria-label') === 'Idle auto-pilot')
  if (!toggleFound) throw new Error('Idle toggle button not found')
  console.log('Clicked manual toggle')
  await sleep(200)

  mode = await queryMode(client)
  console.log('After toggle:', mode)
  if (!mode || !mode.manual) throw new Error('Expected manual after toggle')

  console.log('Dispatching movement key')
  await dispatchKey(client, 'w')
  await sleep(200)
  mode = await queryMode(client)
  console.log('After key:', mode)
  if (!mode || !mode.manual) throw new Error('Expected manual after key')

  console.log('Waiting 15s for timeout fallback...')
  await sleep(15200)
  mode = await queryMode(client)
  console.log('After timeout:', mode)
  if (!mode || mode.manual) throw new Error('Expected idle after timeout')

  console.log('✓ Control-mode validation passed.')
}

main()
  .catch(err => {
    console.error('Validation failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    if (client) client.close()
  })
