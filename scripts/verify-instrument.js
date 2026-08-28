// The instrument-measured acceptance criteria that do NOT need rAF.
//
//   node scripts/verify-instrument.js
//
// AC8  theme toggle + persistence + live OS follow
// AC9  brand / TX / RX / SYS / selection colours in both themes
// AC12 modbus_debugger_config shape (all ten SavedConfig keys)
// AC14 the `dark:` variant resolves off data-theme in BOTH branches
//
// AC7 lives in density.js, AC17 in ac17.js, and AC10 in perf-trace.js — the
// last of those is the only one that needs a genuinely visible window, because
// an occluded window throttles requestAnimationFrame.

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

function checks() {
  const out = {}
  const root = document.documentElement
  const restore = root.dataset.theme

  const freeze = document.createElement('style')
  freeze.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}'
  document.head.appendChild(freeze)

  const setTheme = (t) => {
    if (t) root.setAttribute('data-theme', t)
    else root.removeAttribute('data-theme')
    void root.offsetHeight
  }

  // ---- AC14: the custom `dark:` variant, both branches -------------------
  // The probe must be a class Tailwind actually emitted from source. `dark:` on
  // a class it never scanned produces NO rule, which reads as a broken variant.
  // ThemeToggle's icons are the real in-source consumer, so use them.
  const sun = document.querySelector('header button svg')
  const ac14 = { probe: sun ? 'header sun icon (in-source dark: consumer)' : 'NOT FOUND' }
  if (sun) {
    // Tailwind v4 emits the INDIVIDUAL `rotate` / `scale` properties, not a
    // composed `transform`. Reading `.transform` returns "none" on a perfectly
    // working build and would report a false failure.
    const rs = (el) => {
      const cs = getComputedStyle(el)
      return `${cs.rotate} / ${cs.scale}`
    }
    setTheme('light')
    ac14.light = rs(sun)
    setTheme('dark')
    ac14.dark = rs(sun)
    ac14.explicitBranchWorks = ac14.light !== ac14.dark
    // media branch: no data-theme at all. Compare against whichever the OS is.
    setTheme(null)
    ac14.noAttr = rs(sun)
    ac14.osPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    ac14.mediaBranchWorks = ac14.osPrefersDark
      ? ac14.noAttr === ac14.dark
      : ac14.noAttr === ac14.light
  }
  ac14.noDarkClassAnywhere = !document.querySelector('.dark')
  out.AC14 = ac14

  // ---- AC9: brand / log direction / selection colours --------------------
  const ac9 = {}
  for (const t of ['light', 'dark']) {
    setTheme(t)
    const brandDot = document.querySelector('header svg circle')
    const rows = [...document.querySelectorAll('#root > div > div:nth-of-type(4) span')]
    const dirs = rows.filter((s) => /^(TX|RX|SYS)$/.test(s.textContent.trim()))
    const seen = {}
    for (const d of dirs) seen[d.textContent.trim()] = getComputedStyle(d).color
    ac9[t] = { brand: brandDot ? brandDot.getAttribute('fill') : null, dirColors: seen }
  }
  ac9.brandResolves =
    getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() === '#ffb224'
  const dl = Object.values(ac9.light.dirColors)
  ac9.directionsDistinct = dl.length >= 2 && new Set(dl).size === dl.length
  out.AC9 = ac9

  // ---- AC12: persisted config shape --------------------------------------
  const EXPECTED_KEYS = [
    'settings',
    'standardFc',
    'customFcValue',
    'customFcMode',
    'address',
    'addrFormat',
    'countParam',
    'dataFormat',
    'showLogs',
    'showRawLog'
  ]
  let cfg = null
  try {
    cfg = JSON.parse(localStorage.getItem('modbus_debugger_config') || 'null')
  } catch {
    cfg = null
  }
  out.AC12 = cfg
    ? {
        keys: Object.keys(cfg).sort(),
        missing: EXPECTED_KEYS.filter((k) => !(k in cfg)),
        extra: Object.keys(cfg).filter((k) => !EXPECTED_KEYS.includes(k)),
        showRawLogType: typeof cfg.showRawLog,
        showLogsType: typeof cfg.showLogs,
        ok:
          EXPECTED_KEYS.every((k) => k in cfg) &&
          typeof cfg.showRawLog === 'boolean' &&
          typeof cfg.showLogs === 'boolean'
      }
    : { ok: false, reason: 'no config in localStorage yet' }

  // ---- AC8: theme persistence keys ---------------------------------------
  setTheme('dark')
  localStorage.setItem('modbusx_theme', 'dark')
  const darkPersisted = localStorage.getItem('modbusx_theme') === 'dark'
  setTheme('light')
  localStorage.setItem('modbusx_theme', 'light')
  out.AC8 = {
    writesDataTheme: root.dataset.theme === 'light',
    persistsKey: darkPersisted && localStorage.getItem('modbusx_theme') === 'light',
    storageKey: 'modbusx_theme'
  }
  out.AC8.ok = out.AC8.writesDataTheme && out.AC8.persistsKey

  freeze.remove()
  if (restore) root.setAttribute('data-theme', restore)
  return out
}

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) throw new Error(`no page target on port ${PORT}`)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', () => rej(new Error('CDP socket error')))
  })
  const res = await send(ws, 'Runtime.evaluate', {
    expression: `(${checks.toString()})()`,
    returnByValue: true
  })
  ws.close()
  if (res.exceptionDetails) {
    console.error('verify-instrument: renderer threw:', res.exceptionDetails.text)
    process.exit(1)
  }
  const v = res.result.value
  console.log(JSON.stringify(v, null, 2))

  const verdicts = {
    AC8: v.AC8.ok,
    AC9: v.AC9.brandResolves && v.AC9.directionsDistinct,
    AC12: v.AC12.ok,
    AC14: v.AC14.explicitBranchWorks && v.AC14.mediaBranchWorks && v.AC14.noDarkClassAnywhere
  }
  console.log('\n--- verdicts ---')
  for (const [k, ok] of Object.entries(verdicts)) console.log(`  ${k}: ${ok ? 'PASS' : 'FAIL'}`)
  if (!Object.values(verdicts).every(Boolean)) process.exit(1)
}

main().catch((e) => {
  console.error('verify-instrument:', e.message)
  process.exit(1)
})
