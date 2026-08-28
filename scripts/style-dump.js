// Computed-style dump — the mechanical gate the rewrite is measured against.
//
// Drives the running Electron renderer over the DevTools protocol and emits
// stable-key-ordered JSON for a fixed selector list. Run the app with
// `--remote-debugging-port=9222` first (see `pnpm dev:cdp`).
//
//   node scripts/style-dump.js --out .omc/artifacts/ui-baseline/dump-step0.json
//
// The selectors are STRUCTURAL, not class- or style-based, deliberately: every
// className in this tree is created by the rewrite and every inline style is
// removed by it, so only structural paths can span the migration. What makes
// that safe is AC6 — DOM order is invariant, and it is asserted separately.
//
// Every captured property is inline-set in the pre-rewrite build, which is what
// makes the dump immune to Tailwind's Preflight: a `@layer base` rule can never
// beat an inline style, so Preflight cannot move a baseline number.
//
// A selector that fails to match is a HARD ERROR, never a shorter JSON. A
// shrinking dump reads as a diff, and under the invariant/mapped property
// partition that is indistinguishable from an accepted change.

const PORT = Number(process.env.CDP_PORT || 9222)

// Fixed selector list.
//
// Re-anchored when the frameless title bar landed: the sections moved one level
// down, under a padded content wrapper below the <header>. `#root > div > div`
// is that wrapper, and the four sections are its div children.
const CONTENT = '#root > div > div'
const SELECTORS = [
  ['root-wrapper', CONTENT],
  ['slave-id-input', `${CONTENT} > div:nth-of-type(1) > div:nth-of-type(2) input`],
  ['data-monitor-panel', `${CONTENT} > div:nth-of-type(3)`],
  ['grid-container', '[data-grid-body] > div'],
  ['first-register-cell', '[data-grid-body] > div > div:first-child'],
  [
    'first-log-direction',
    `${CONTENT} > div:nth-of-type(4) > div:nth-of-type(2) > div:first-child > span:nth-of-type(2)`
  ]
]

// Partitioned per the consensus gate. INVARIANT must stay byte-identical at
// every step; MAPPED may change only for the section just ported, and the
// commit message must name the token mapping.
const INVARIANT = ['height', 'font-size', 'padding', 'border-radius', 'grid-template-columns']
const MAPPED = ['background-color', 'color', 'border-color']
const PROPS = [...INVARIANT, ...MAPPED].sort()

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function die(msg) {
  console.error(`style-dump: ${msg}`)
  process.exit(1)
}

async function pickTarget() {
  let list
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    list = await res.json()
  } catch (e) {
    die(
      `cannot reach the DevTools endpoint on port ${PORT} (${e.message}).\n` +
        `  Start the app with --remote-debugging-port=${PORT} first.`
    )
  }
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page)
    die(
      `no page target on port ${PORT}. Targets seen: ${list.map((t) => t.type).join(', ') || 'none'}`
    )
  return page
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 10000)
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.addEventListener('error', (e) => {
      clearTimeout(timer)
      reject(new Error(e.message || 'CDP socket error'))
    })
  })
}

let nextId = 1
function send(ws, method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`))
      else resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

// Runs in the renderer. Returns either the dump or the list of misses, so the
// hard-error path is decided here rather than by an absent key downstream.
function collect(selectors, props, theme) {
  // Set the theme here rather than inheriting whatever the page was left in.
  // A dump silently taken in the wrong theme compares dark values against a
  // light baseline and reports every mapped property as a regression.
  if (theme) document.documentElement.setAttribute('data-theme', theme)
  const misses = []
  const out = {}
  // Freeze animation. `inputBase` carries `transition: border 0.2s`, so a dump
  // taken right after a theme flip returns a MID-TRANSITION colour — measured:
  // a dark-mode capture reported the light border #e4e4e7 instead of #27272a.
  // Killing transitions makes the gate independent of when it runs.
  const freeze = document.createElement('style')
  freeze.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}'
  document.head.appendChild(freeze)
  // Force a reflow so the frozen state is what getComputedStyle reads.
  void document.documentElement.offsetHeight
  for (const [key, sel] of selectors) {
    const el = document.querySelector(sel)
    if (!el) {
      misses.push({ key, sel })
      continue
    }
    const cs = getComputedStyle(el)
    const entry = {}
    for (const p of props) entry[p] = cs.getPropertyValue(p).trim()
    out[key] = entry
  }
  freeze.remove()

  // Scrollbar presence changes the grid's content width by 8px, which moves
  // every grid track by ~0.5px. grid-template-columns is an INVARIANT property
  // in the gate, so an unrecorded scrollbar toggle reads as a density
  // regression. Record it so a diff can be attributed rather than guessed at.
  const gridEl = document.querySelector('#root > div > div:nth-of-type(3) > div:nth-of-type(2)')
  const scrollbar = gridEl ? gridEl.offsetWidth - gridEl.clientWidth : null

  return {
    misses,
    dump: out,
    meta: {
      theme: document.documentElement.dataset.theme ?? null,
      themeRequested: theme ?? null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      gridScrollbarPx: scrollbar
    }
  }
}

async function main() {
  const outPath = arg('--out', null)
  const target = await pickTarget()
  const ws = await connect(target.webSocketDebuggerUrl)

  await send(ws, 'Runtime.enable')

  // Normalize the viewport inside this session. Electron does not implement
  // Browser.setWindowBounds, and an Emulation override is session-scoped — it
  // reverts when this socket closes. That is the right shape for a gate that
  // runs nineteen times: every run self-normalizes instead of inheriting
  // whatever window size a previous run happened to leave behind.
  const [vw, vh] = arg('--viewport', '1280x800').split('x').map(Number)
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: vw,
    height: vh,
    deviceScaleFactor: 1,
    mobile: false
  })
  // Let layout settle before reading computed styles back.
  await new Promise((r) => setTimeout(r, 600))

  // Default to light so a gate run is reproducible regardless of page state.
  const theme = arg('--theme', 'light')
  const expression = `(${collect.toString()})(${JSON.stringify(SELECTORS)}, ${JSON.stringify(PROPS)}, ${JSON.stringify(theme)})`
  const res = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false
  })

  if (res.exceptionDetails) {
    die(`renderer threw: ${res.exceptionDetails.text ?? JSON.stringify(res.exceptionDetails)}`)
  }

  const { misses, dump, meta } = res.result.value
  ws.close()

  if (misses.length) {
    console.error('style-dump: selector(s) did not match — refusing to emit a partial dump:')
    for (const m of misses) console.error(`  [${m.key}] ${m.sel}`)
    console.error(
      '\n  Selectors 4-6 need data and at least one log line present.\n' +
        '  Run a successful read first, then re-run this script.'
    )
    process.exit(1)
  }

  // Stable key order so the diff is a diff and not a reordering.
  const ordered = {}
  for (const [key] of SELECTORS) {
    ordered[key] = {}
    for (const p of PROPS) ordered[key][p] = dump[key][p]
  }
  const payload = JSON.stringify({ meta, styles: ordered }, null, 2) + '\n'

  if (outPath) {
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { dirname } = await import('node:path')
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, payload)
    console.error(`style-dump: wrote ${outPath} (theme=${meta.theme}, viewport=${meta.viewport})`)
  } else {
    process.stdout.write(payload)
  }
}

main().catch((e) => die(e.stack || e.message))
