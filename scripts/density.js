// AC7 density measurement — the number the grid rewrite is held to.
//
//   node scripts/density.js --out .omc/artifacts/ui-baseline/density-step0.json
//
// Reports, at a normalized viewport:
//   - the computed grid-template-columns track list, its count, and whether all
//     tracks are equal (the primary AC7 assertion)
//   - the number of register cells FULLY inside the scroll viewport
//   - the first cell's computed width, checked against what minmax() actually
//     guarantees rather than against a nominal 70px
//
// The nominal-70px check is deliberately NOT made. `repeat(auto-fill,
// minmax(70px,1fr))` stretches every track to fill the container, so a correct
// build measures ~72.4px at 1280x800 — the original "70px +/- 2px" criterion
// would have failed the unmodified baseline.

const PORT = Number(process.env.CDP_PORT || 9222)

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

let nextId = 1
function send(ws, method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method}: timed out`)), 20000)
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

function measure() {
  const GRID = '#root > div > div:nth-of-type(3) > div:nth-of-type(2) > div'
  const grid = document.querySelector(GRID)
  if (!grid) return { error: `grid not found: ${GRID}` }

  const cells = [...grid.children]
  if (!cells.length) return { error: 'grid has no cells — run a successful read first' }

  const cs = getComputedStyle(grid)
  const tracks = cs.gridTemplateColumns.split(/\s+/).filter(Boolean).map(parseFloat)
  const allEqual = tracks.every((t) => Math.abs(t - tracks[0]) < 0.5)

  // "Fully visible" = the cell's box is entirely within the scroll container's
  // client box. The scroll parent is the grid's own scrolling ancestor.
  let scroller = grid.parentElement
  while (scroller && scroller.scrollHeight <= scroller.clientHeight + 1) {
    scroller = scroller.parentElement
  }
  const box = (scroller || document.documentElement).getBoundingClientRect()
  const fullyVisible = cells.filter((c) => {
    const r = c.getBoundingClientRect()
    return (
      r.top >= box.top - 0.5 &&
      r.bottom <= box.bottom + 0.5 &&
      r.left >= box.left - 0.5 &&
      r.right <= box.right + 0.5
    )
  }).length

  const firstW = cells[0].getBoundingClientRect().width

  // See style-dump.js: an 8px scrollbar moves every track by ~0.5px. Record it
  // so a width delta can be attributed instead of guessed at.
  const scrollHost = grid.parentElement
  const scrollbarPx = scrollHost ? scrollHost.offsetWidth - scrollHost.clientWidth : null

  return {
    scrollbarPx,
    cellCount: cells.length,
    fullyVisibleCells: fullyVisible,
    trackCount: tracks.length,
    tracks,
    allTracksEqual: allEqual,
    firstCellWidth: Number(firstW.toFixed(3)),
    gridTemplateColumns: cs.gridTemplateColumns,
    gap: cs.gap,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    theme: document.documentElement.dataset.theme ?? null
  }
}

async function main() {
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

  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: vw,
    height: vh,
    deviceScaleFactor: 1,
    mobile: false
  })
  await new Promise((r) => setTimeout(r, 400))

  const res = await send(ws, 'Runtime.evaluate', {
    expression: `(${measure.toString()})()`,
    returnByValue: true
  })
  ws.close()

  const value = res.result.value
  if (value.error) {
    console.error(`density: ${value.error}`)
    process.exit(1)
  }

  const payload = JSON.stringify(value, null, 2) + '\n'
  if (out) {
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { dirname } = await import('node:path')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, payload)
    console.error(`density: wrote ${out}`)
  }
  process.stdout.write(payload)
}

main().catch((e) => {
  console.error('density:', e.message)
  process.exit(1)
})
