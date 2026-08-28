// AC17 — the dark-mode `dark:` bleed detector.
//
//   node scripts/ac17.js
//
// shadcn v4 primitives ship their own `dark:` appearance layer:
// `dark:bg-input/30` on button/checkbox/input/select and `dark:hover:bg-input/50`
// on button/select. twMerge resolves conflicts only within a matching modifier
// prefix, so a plain `bg-*` override does NOT remove them. With `--input`
// mapped to #27272a, any survivor lays a translucent fill over a surface the
// app owns — in the grid that is every cell at once.
//
// The test is mechanical: in dark mode, these surfaces must compute to an
// OPAQUE colour equal to their mapped token. Any rgba()/color-mix() result is
// a leak.
//
// Transitions are frozen before reading. shadcn's Button carries
// `transition-all`, and a sample taken mid-transition reports an interpolated
// colour — measured once as a false "white in dark mode" on a correct build.

const PORT = Number(process.env.CDP_PORT || 9222)

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

function probe(expected) {
  const prev = document.documentElement.dataset.theme
  document.documentElement.setAttribute('data-theme', 'dark')

  const freeze = document.createElement('style')
  freeze.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}'
  document.head.appendChild(freeze)
  void document.documentElement.offsetHeight

  const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null)
  const settings = document.querySelector('#root > div > div > div:nth-of-type(1)')
  const buttons = settings ? [...settings.querySelectorAll('button')] : []

  const samples = {}
  const cell = document.querySelector(
    '#root > div > div > div:nth-of-type(3) > div:nth-of-type(2) > div > div:first-child'
  )
  if (cell) samples['grid cell (idle)'] = bg(cell)

  const input = settings && settings.querySelector('input')
  if (input) samples['text Input (idle)'] = bg(input)

  const scan = buttons.find((b) => b.textContent.trim() === '↻')
  if (scan) samples['scan button (idle)'] = bg(scan)

  const trigger = buttons.find((b) => b.hasAttribute('aria-expanded'))
  if (trigger) samples['SelectTrigger (idle)'] = bg(trigger)

  const themeToggle = document.querySelector('header button')
  if (themeToggle) samples['ThemeToggle (idle)'] = bg(themeToggle)

  // Contrast, not just opacity. A background override on a default-variant
  // Button leaves the variant's text colour behind: measured once as
  // rgb(24,24,27) text on an rgb(28,28,32) fill — an invisible label that every
  // background-only check passes. Flag any button whose text and background are
  // within a small luminance distance of each other.
  const lum = (c) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '')
    if (!m) return null
    const [r, g, b2] = [+m[1], +m[2], +m[3]]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2
  }
  const lowContrast = []
  for (const el of document.querySelectorAll('#root button')) {
    if (!el.textContent.trim()) continue
    const cs = getComputedStyle(el)
    const lt = lum(cs.color)
    const lb = lum(cs.backgroundColor)
    if (lt === null || lb === null) continue
    if (cs.backgroundColor === 'rgba(0, 0, 0, 0)') continue
    if (Math.abs(lt - lb) < 20) {
      lowContrast.push(
        `"${el.textContent.trim().slice(0, 14)}" ${cs.color} on ${cs.backgroundColor}`
      )
    }
  }

  // dark:hover:bg-input/50 is a DIFFERENT modifier from dark:bg-input/30, so an
  // idle sample cannot see it. :hover cannot be synthesized from script, so the
  // hover neutralizer is asserted statically instead: every constant in
  // lib/ui-density.ts that carries a `dark:` fill must also carry the matching
  // `dark:hover:` one, which the file's Rule 2 states and its table records.

  freeze.remove()
  if (prev) document.documentElement.setAttribute('data-theme', prev)
  else document.documentElement.removeAttribute('data-theme')

  const translucent = (v) => v && (/color-mix/.test(v) || /rgba\((?!.*,\s*1\))/.test(v))
  const leaks = Object.entries(samples).filter(([, v]) => translucent(v))
  const wrong = Object.entries(samples).filter(
    ([k, v]) => expected[k] && v !== expected[k] && !translucent(v)
  )

  return {
    samples,
    lowContrastButtons: lowContrast,
    leaks: leaks.map(([k, v]) => `${k} = ${v}`),
    unexpected: wrong.map(([k, v]) => `${k} = ${v} (expected ${expected[k]})`),
    verdict: leaks.length
      ? 'LEAK'
      : lowContrast.length
        ? 'LOW_CONTRAST'
        : wrong.length
          ? 'UNEXPECTED'
          : 'CLEAN'
  }
}

async function main() {
  // Expected opaque values, derived from the Step 5 token table. If Step 5 ever
  // adjusts a dark value, these move with it.
  const EXPECTED = {
    'grid cell (idle)': 'rgb(38, 38, 42)', // --cell  #26262a
    'text Input (idle)': 'rgb(27, 27, 30)', // --background #1b1b1e
    'scan button (idle)': 'rgb(38, 38, 42)', // --cell via CONTROL_QUIET
    'SelectTrigger (idle)': 'rgb(27, 27, 30)',
    'ThemeToggle (idle)': 'rgb(27, 27, 30)'
  }

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) throw new Error(`no page target on port ${PORT}`)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('CDP socket error')))
  })

  const res = await send(ws, 'Runtime.evaluate', {
    expression: `(${probe.toString()})(${JSON.stringify(EXPECTED)})`,
    returnByValue: true
  })
  ws.close()

  const v = res.result.value
  console.log(JSON.stringify(v, null, 2))
  if (v.verdict !== 'CLEAN') process.exit(1)
}

main().catch((e) => {
  console.error('ac17:', e.message)
  process.exit(1)
})
