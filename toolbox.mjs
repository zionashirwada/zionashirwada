import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SVGL = (f) => `https://svgl.app/library/${f}.svg`
const SIMPLE = (f) => `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${f}.svg`

const ROWS = [
  [
    { label: "TypeScript", src: SVGL("typescript"), bg: "#3178c6", fit: 1 },
    { label: "JavaScript", src: SVGL("javascript"), bg: "#f7df1e", fit: 1 },
    { label: "PHP", src: SVGL("php_dark"), bg: "#1d1e2c", fit: 0.62 },
    { label: "Python", src: SVGL("python"), bg: "#ffffff" },
    { label: "Java", src: SVGL("java"), bg: "#1b1f24", fit: 0.6 },
    { label: "C#", src: SVGL("csharp"), bg: "#ffffff", fit: 0.6 },
    { label: "React", src: SVGL("react_dark"), bg: "#20232a", fit: 0.6 },
    { label: "Next.js", src: SVGL("nextjs_icon_dark"), bg: "#ffffff", fit: 0.6 },
    { label: "Tailwind CSS", src: SVGL("tailwindcss"), bg: "#0b1120", fit: 0.6 },
    { label: "Laravel", src: SVGL("laravel"), bg: "#ffffff", fit: 0.52 },
    { label: "Node.js", src: SVGL("nodejs"), bg: "#1a1d1a", fit: 0.52 },
  ],
  [
    { label: "Express", src: SVGL("expressjs"), bg: "#ffffff", fit: 0.56 },
    { label: "FastAPI", src: SVGL("fastapi"), bg: "#05998b", fit: 0.6, white: true },
    { label: "Spring Boot", src: SVGL("spring"), bg: "#ffffff", fit: 0.5 },
    { label: "PostgreSQL", src: SVGL("postgresql"), bg: "#1d2735", fit: 0.56 },
    { label: "MySQL", src: SVGL("mysql-icon-light"), bg: "#ffffff", fit: 0.52 },
    { label: "MongoDB", src: SVGL("mongodb-icon-dark"), bg: "#001e2b", fit: 0.56 },
    { label: "AWS", src: SVGL("aws_light"), bg: "#ffffff", fit: 0.5 },
    { label: "Azure", src: SVGL("azure"), bg: "#0b1a33", fit: 0.52 },
    { label: "Docker", src: SVGL("docker"), bg: "#ffffff", fit: 0.54 },
    { label: "GitHub Actions", src: SIMPLE("githubactions"), bg: "#2088ff", fit: 0.52, white: true },
    { label: "Git", src: SVGL("git"), bg: "#ffffff" },
  ],
]

const W = 720
const SIZE = 58
const OVERLAP = 0.12
const MAG = 0.28
const LIFT = 0.19
const REACH = 1.2
const ROOM = Math.max(0, OVERLAP + MAG / 2)
const RISE = LIFT + MAG
const TILT = [-7, 5, -4, 8, -6, 4, -8, 6, -3, 7, -5, 6]
const TOP = Math.ceil(SIZE * RISE + 44)
const ROW_GAP = 60
const H = TOP + ROWS.length * SIZE + (ROWS.length - 1) * ROW_GAP + 16
const T = 14
const SWEEP = 5
const STARTS = [1.2, 6.8]
const STEPS = 70
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`

const THEMES = {
  light: { pop: "#ffffff", popFg: "#1f2328", border: "#d1d9e0" },
  dark: { pop: "#151b23", popFg: "#f0f6fc", border: "#3d444d" },
}

const r2 = (v) => +v.toFixed(2)
const pct = (s) => r2((s / T) * 100) + "%"
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

const charWidth = (ch) =>
  /[ilj.,'|!:;]/.test(ch) ? 0.26 : ch === " " ? 0.28 : /[mwMW]/.test(ch) ? 0.86 : /[A-Z#]/.test(ch) ? 0.68 : /[0-9]/.test(ch) ? 0.56 : /[ft r]/.test(ch) ? 0.36 : 0.54
const textWidth = (s, size) => s.split("").reduce((w, ch) => w + charWidth(ch) * size, 0)

async function dataUri(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return "data:image/svg+xml;base64," + Buffer.from(await res.text()).toString("base64")
}

const swellAt = (centers, k, x) => Math.max(0, 1 - Math.abs(x - centers[k]) / SIZE / REACH) ** 2

function rowMotion(n, start) {
  const step = SIZE * (1 - OVERLAP)
  const centers = Array.from({ length: n }, (_, k) => k * step + SIZE / 2)
  const from = centers[0] - REACH * SIZE
  const to = centers[n - 1] + REACH * SIZE
  const at = (j) => start + (SWEEP * j) / STEPS
  const pointer = (j) => from + ((to - from) * j) / STEPS
  const tiles = centers.map((_, i) => {
    const frames = [`0%,${pct(at(0))}{transform:translate(0px,0px) rotate(${TILT[i % TILT.length]}deg) scale(1)}`]
    for (let j = 1; j < STEPS; j++) {
      const x = pointer(j)
      const v = swellAt(centers, i, x)
      let shift = 0
      for (let k = 0; k < n; k++) if (k !== i) shift += swellAt(centers, k, x) * (k < i ? 1 : -1)
      frames.push(`${pct(at(j))}{transform:translate(${r2(shift * SIZE * ROOM)}px,${r2(-v * LIFT * SIZE)}px) rotate(${r2(TILT[i % TILT.length] * (1 - v))}deg) scale(${r2(1 + v * MAG)})}`)
    }
    frames.push(`${pct(at(STEPS))},100%{transform:translate(0px,0px) rotate(${TILT[i % TILT.length]}deg) scale(1)}`)
    return frames.join("")
  })
  const left = centers[0] - SIZE / 2
  const right = centers[n - 1] + SIZE / 2
  const timeAt = (x) => start + (SWEEP * (x - from)) / (to - from)
  const enter = timeAt(left)
  const leave = timeAt(right)
  const switches = centers.slice(1).map((c, k) => timeAt((centers[k] + c) / 2))
  return { centers, tiles, enter, leave, switches, width: right - left }
}

export async function render(theme, logos) {
  const th = THEMES[theme]
  const glide = "animation-timing-function:cubic-bezier(.22,1,.36,1)"
  const css = [
    `text{font-family:${FONT}}`,
    `.deal{animation:deal .7s cubic-bezier(.22,1,.36,1) both;transform-box:view-box;transform-origin:0 0}`,
    `.sw,.tip,.lab{animation-duration:${T}s;animation-timing-function:linear;animation-iteration-count:infinite;animation-fill-mode:both;transform-box:view-box;transform-origin:0 0}`,
    `.lab{opacity:0}`,
    `.tip{opacity:0}`,
    `@keyframes deal{from{opacity:0;transform:translateY(12px) scale(.94);filter:blur(3px)}to{opacity:1;transform:none;filter:blur(0)}}`,
  ]
  const tiles = []
  const tips = []
  let index = 0
  for (const [r, row] of ROWS.entries()) {
    const m = rowMotion(row.length, STARTS[r])
    const x0 = (W - m.width) / 2
    const base = TOP + SIZE + r * (SIZE + ROW_GAP)
    const drawn = row.map((item, i) => {
      css.push(`.s${r}-${i}{animation-name:s${r}-${i}}@keyframes s${r}-${i}{${m.tiles[i]}}`)
      const fit = item.fit ?? 0.54
      const img = `<image href="${logos.get(item.src)}" x="${r2((-fit * SIZE) / 2)}" y="${r2(-SIZE / 2 - (fit * SIZE) / 2)}" width="${r2(fit * SIZE)}" height="${r2(fit * SIZE)}"${fit === 1 ? ' clip-path="url(#tile)"' : ""}${item.white ? ' filter="url(#white)"' : ""}/>`
      return (
        `<g transform="translate(${r2(x0 + m.centers[i])},${base})"><g class="deal" style="animation-delay:${r2(index++ * 0.04)}s"><g class="sw s${r}-${i}" style="transform:rotate(${TILT[i % TILT.length]}deg)" role="img" aria-label="${esc(item.label)}">` +
        `<use href="#shape" fill="${item.bg}" filter="url(#shadow)"/>${img}<use href="#shape" fill="url(#sheen)"/><use href="#shape" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".8"/>` +
        `</g></g></g>`
      )
    })
    tiles.push(...drawn.reverse())

    const name = `t${r}`
    const fade = 0.2
    css.push(
      `.${name}{animation-name:${name},${name}o}`,
      `@keyframes ${name}{0%,${pct(m.switches[0] ?? m.enter)}{transform:translateX(${r2(x0 + m.centers[0])}px);${glide}}` +
        m.switches.map((s, k) => `${pct(s + 0.3)}${k + 1 < m.switches.length ? `,${pct(m.switches[k + 1])}` : ",100%"}{transform:translateX(${r2(x0 + m.centers[k + 1])}px);${glide}}`).join("") +
        `}`,
      `@keyframes ${name}o{0%,${pct(m.enter)}{opacity:0}${pct(m.enter + fade)},${pct(m.leave)}{opacity:1}${pct(m.leave + fade)},100%{opacity:0}}`,
    )
    const bottom = base - SIZE * (1 + RISE) - 10
    const labels = row.map((item, i) => {
      const on = i === 0 ? m.enter - 0.01 : m.switches[i - 1]
      const off = i === row.length - 1 ? m.leave + fade : m.switches[i]
      css.push(`.l${r}-${i}{animation-name:l${r}-${i}}@keyframes l${r}-${i}{0%,${pct(on - 0.01)}{opacity:0}${pct(on)},${pct(off)}{opacity:1}${pct(off + 0.01)},100%{opacity:0}}`)
      const tw = r2(textWidth(item.label, 13))
      const bw = tw + 20
      return (
        `<g class="lab l${r}-${i}"><rect x="${r2(-bw / 2)}" y="-26" width="${r2(bw)}" height="26" rx="6" fill="${th.pop}" stroke="${th.border}"/>` +
        `<path d="M-4.5 -.5 0 4.5 4.5 -.5Z" fill="${th.pop}"/><path d="M-4.5 -.5 0 4.5 4.5 -.5" fill="none" stroke="${th.border}"/>` +
        `<text y="-8.5" text-anchor="middle" font-size="13" font-weight="500" fill="${th.popFg}" textLength="${tw}" lengthAdjust="spacing">${esc(item.label)}</text></g>`
      )
    })
    tips.push(`<g transform="translate(0,${r2(bottom)})"><g class="tip ${name}">${labels.join("")}</g></g>`)
  }
  css.push(`@media (prefers-reduced-motion:reduce){.deal,.sw,.tip,.lab{animation:none}}`)

  const rad = r2(SIZE * 0.23)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title">
<title id="title">Tech stack: ${ROWS.flat().map((i) => esc(i.label)).join(", ")}</title>
<defs>
<rect id="shape" x="${-SIZE / 2}" y="${-SIZE}" width="${SIZE}" height="${SIZE}" rx="${rad}"/>
<clipPath id="tile"><use href="#shape"/></clipPath>
<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity=".22"/><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".12"/></filter>
<filter id="white"><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter>
</defs>
<style>
${css.join("\n")}
</style>
${tiles.join("\n")}
${tips.join("\n")}
</svg>
`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || "assets"
  const logos = new Map()
  for (const item of ROWS.flat()) logos.set(item.src, await dataUri(item.src))
  mkdirSync(out, { recursive: true })
  for (const theme of Object.keys(THEMES)) writeFileSync(join(out, `toolbox-${theme}.svg`), await render(theme, logos))
}
