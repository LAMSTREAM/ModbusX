// Capture a PNG of the running renderer at a normalized viewport.
//
//   node scripts/screenshot.js --out .omc/artifacts/ui-baseline/light.png
//
// Same session-scoped Emulation override as style-dump.js so screenshots and
// dumps are always taken at the same size.

const PORT = Number(process.env.CDP_PORT || 9222)

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

let nextId = 1
function send(ws, method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`))
      else resolve(msg.result)
    }
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage)
      reject(new Error(`${method}: timed out after 20s`))
    }, 20000)
    const wrapped = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id === id) clearTimeout(timer)
      onMessage(ev)
    }
    ws.addEventListener('message', wrapped)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function main() {
  const out = arg('--out')
  if (!out) throw new Error('--out is required')
  const [vw, vh] = arg('--viewport', '1280x800').split('x').map(Number)

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) throw new Error(`no page target on port ${PORT}`)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('CDP socket error')))
  })

  // A minimized or occluded Electron window reports visibilityState 'hidden'
  // and stops producing compositor frames, which makes captureScreenshot block
  // forever. Forcing the lifecycle back to active is what makes this usable
  // unattended. (Measured: fromSurface:false times out here even when active,
  // so the surface path — the default — is the one that works.)
  await send(ws, 'Page.enable')
  await send(ws, 'Page.setWebLifecycleState', { state: 'active' })
  await new Promise((r) => setTimeout(r, 400))

  // Order is load-bearing: the metrics override must be applied AFTER the page
  // is active. Applying it first leaves capture deadlocked even with the
  // lifecycle forced afterwards.
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: vw,
    height: vh,
    deviceScaleFactor: 1,
    mobile: false
  })
  await new Promise((r) => setTimeout(r, 400))
  // Measured on this Electron build: with an Emulation metrics override active,
  // a plain captureScreenshot (and one with only `clip`) deadlocks. Only
  // captureBeyondViewport:true + an explicit clip returns. Keep all three
  // together — dropping any one of them reintroduces the hang.
  // The first capture against a window that has been idle/occluded reliably
  // times out while it wakes the compositor; a subsequent one succeeds. Retry
  // rather than treating the first timeout as fatal.
  let data
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      ;({ data } = await send(ws, 'Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: vw, height: vh, scale: 1 }
      }))
      break
    } catch (e) {
      if (attempt === 4) throw e
      console.error(`screenshot: capture attempt ${attempt} failed (${e.message}); retrying`)
      await new Promise((r) => setTimeout(r, 800))
    }
  }
  ws.close()

  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, Buffer.from(data, 'base64'))
  console.error(`screenshot: wrote ${out} (${vw}x${vh})`)
}

main().catch((e) => {
  console.error('screenshot:', e.message)
  process.exit(1)
})
