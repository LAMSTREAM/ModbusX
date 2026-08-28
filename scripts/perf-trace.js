// AC10 perf measurement — frame timing under the grid's real workload.
//
//   node scripts/perf-trace.js --seconds 30 --out .omc/artifacts/ui-baseline/perf-step0.json
//
// Samples requestAnimationFrame deltas in the renderer while synthetically
// drag-selecting across the register grid, with auto-read polling active. That
// is the exact workload AC10 names: hundreds of memoized cells re-rendering on
// a poll while the user drags a selection over them.
//
// rAF sampling is used rather than a DevTools Performance trace because it is
// reproducible and directly comparable between the baseline build and the
// rewritten build — a recorded trace has to be read by a human, and AC10's
// primary clause is a *relative* comparison against this baseline.
//
// Reported: p50 / p95 / p99 / max frame time, long-task counts over 16.7ms,
// 50ms and 100ms, and the total frames observed.

const PORT = Number(process.env.CDP_PORT || 9222)

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

let nextId = 1
function send(ws, method, params = {}, timeoutMs = 120000) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method}: timed out`)), timeoutMs)
    const onMessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== id) return
      clearTimeout(timer)
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`))
      else resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

// Runs in the renderer for `seconds`, then resolves with the frame stats.
function run(seconds) {
  return new Promise((resolve) => {
    const GRID = '#root > div > div > div:nth-of-type(3) > div:nth-of-type(2) > div'
    const grid = document.querySelector(GRID)
    if (!grid || !grid.children.length) {
      resolve({ error: 'grid empty — run a successful read first' })
      return
    }

    const cells = [...grid.children]
    const frames = []
    let last = performance.now()
    let stop = false

    const tick = (now) => {
      frames.push(now - last)
      last = now
      if (!stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    // Synthetic drag-select: mousedown on the first cell, then walk the pointer
    // across the grid firing mouseenter/mousemove, which is what the component
    // listens for. Kept deterministic so both builds see the same input.
    const fire = (el, type, extra = {}) => {
      const r = el.getBoundingClientRect()
      el.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
          buttons: 1,
          ...extra
        })
      )
    }

    fire(cells[0], 'mousedown')
    let i = 0
    let dir = 1
    const walker = setInterval(() => {
      i += dir
      if (i >= cells.length - 1 || i <= 0) dir = -dir
      const el = cells[Math.max(0, Math.min(cells.length - 1, i))]
      fire(el, 'mouseenter')
      fire(el, 'mousemove')
    }, 16)

    setTimeout(() => {
      stop = true
      clearInterval(walker)
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

      // Drop the first few frames: they capture the cost of starting the walk,
      // not steady-state rendering.
      const s = frames.slice(5).sort((a, b) => a - b)
      const q = (p) =>
        s.length ? Number(s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(3)) : null
      resolve({
        seconds,
        cells: cells.length,
        frames: s.length,
        p50: q(0.5),
        p95: q(0.95),
        p99: q(0.99),
        max: s.length ? Number(s[s.length - 1].toFixed(3)) : null,
        over16_7: s.filter((f) => f > 16.7).length,
        over50: s.filter((f) => f > 50).length,
        over100: s.filter((f) => f > 100).length
      })
    }, seconds * 1000)
  })
}

async function main() {
  const seconds = Number(arg('--seconds', '30'))
  const out = arg('--out')
  const [vw, vh] = arg('--viewport', '1280x800').split('x').map(Number)

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) throw new Error(`no page target on port ${PORT}`)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('CDP socket error')))
  })

  // A hidden window throttles rAF to ~1Hz, which would make the whole
  // measurement meaningless. Forcing the lifecycle active is not reliably
  // sticky here — applying the metrics override, or the window losing focus,
  // can flip it back — so re-assert and poll rather than checking once.
  await send(ws, 'Page.enable')

  // ORDER IS LOAD-BEARING, and it is the same rule screenshot.js needs:
  // setWebLifecycleState must be applied BEFORE the metrics override. Applying
  // the override first leaves the page reporting 'hidden' no matter how many
  // times the lifecycle is re-asserted afterwards.
  let visible = false
  for (let attempt = 1; attempt <= 6 && !visible; attempt++) {
    await send(ws, 'Page.setWebLifecycleState', { state: 'active' })
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
      width: vw,
      height: vh,
      deviceScaleFactor: 1,
      mobile: false
    })
    await new Promise((r) => setTimeout(r, 600))
    const vis = await send(ws, 'Runtime.evaluate', {
      expression: 'document.visibilityState',
      returnByValue: true
    })
    visible = vis.result.value === 'visible'
    if (!visible) console.error(`perf-trace: page still hidden (attempt ${attempt}); re-asserting`)
  }
  if (!visible) {
    console.error(
      'perf-trace: page will not become visible — rAF is throttled and the numbers would be' +
        ' meaningless. Restore/focus the app window and retry.'
    )
    process.exit(1)
  }

  console.error(`perf-trace: sampling ${seconds}s of drag-select...`)
  const res = await send(
    ws,
    'Runtime.evaluate',
    {
      expression: `(${run.toString()})(${seconds})`,
      returnByValue: true,
      awaitPromise: true
    },
    (seconds + 30) * 1000
  )
  ws.close()

  const value = res.result.value
  if (value.error) {
    console.error(`perf-trace: ${value.error}`)
    process.exit(1)
  }

  const payload = JSON.stringify(value, null, 2) + '\n'
  if (out) {
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { dirname } = await import('node:path')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, payload)
    console.error(`perf-trace: wrote ${out}`)
  }
  process.stdout.write(payload)
}

main().catch((e) => {
  console.error('perf-trace:', e.message)
  process.exit(1)
})
