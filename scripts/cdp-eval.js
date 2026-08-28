// Ad-hoc CDP evaluator — companion to style-dump.js.
//
//   node scripts/cdp-eval.js "document.title"
//   node scripts/cdp-eval.js --file probe.js
//
// Evaluates an expression in the running renderer and prints the JSON result.
// Used for the Step 0 selector validation, the AC7 cell count, and the AC8/AC9/
// AC14/AC17 instrument checks, none of which belong in the frozen dump script.

const PORT = Number(process.env.CDP_PORT || 9222)

function arg(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null
}

async function main() {
  const file = arg('--file')
  const expression = file
    ? (await import('node:fs')).readFileSync(file, 'utf8')
    : process.argv.slice(2).join(' ')
  if (!expression.trim()) {
    console.error('cdp-eval: nothing to evaluate')
    process.exit(1)
  }

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) {
    console.error(`cdp-eval: no page target on port ${PORT}`)
    process.exit(1)
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('CDP socket error')))
  })

  let nextId = 1
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const onMessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.id !== id) return
        ws.removeEventListener('message', onMessage)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
      ws.addEventListener('message', onMessage)
      ws.send(JSON.stringify({ id, method, params }))
    })

  // Same session-scoped viewport normalization as style-dump.js, so an ad-hoc
  // measurement and a gate dump are always read at the same size.
  const [vw, vh] = (arg('--viewport') || '1280x800').split('x').map(Number)
  await send('Emulation.setDeviceMetricsOverride', {
    width: vw,
    height: vh,
    deviceScaleFactor: 1,
    mobile: false
  })
  await new Promise((r) => setTimeout(r, 250))

  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })

  ws.close()

  if (result.exceptionDetails) {
    console.error('cdp-eval: renderer threw:', result.exceptionDetails.text)
    console.error(JSON.stringify(result.exceptionDetails.exception ?? {}, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify(result.result.value, null, 2))
}

main().catch((e) => {
  console.error('cdp-eval:', e.message)
  process.exit(1)
})
