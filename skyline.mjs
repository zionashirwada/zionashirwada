import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const DAY = 86400000
const W = 900
const HEAD = 58
const STAGE = 430
const FOOT = 46
const H = HEAD + STAGE + FOOT
const PX = 24
const GUTTER = 34
const CELL = 0.84
const OFF = (1 - CELL) / 2
const YAW = Math.PI / 4
const ELEV = (34 * Math.PI) / 180
const T = 16
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`

const THEMES = {
  light: { bg: "#ffffff", fg: "#1f2328", muted: "#59636e", border: "#d1d9e0", palette: ["#c6e48b", "#7bc96f", "#239a3b", "#196127"], emptyMix: 0.075 },
  dark: { bg: "#0d1117", fg: "#f0f6fc", muted: "#9198a1", border: "#3d444d", palette: ["#0e4429", "#006d32", "#26a641", "#39d353"], emptyMix: 0.11 },
}

const toKey = (ms) => new Date(ms).toISOString().slice(0, 10)
const dayMs = (s) => Date.parse(s.slice(0, 10) + "T00:00:00Z")
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const easeInOutCubic = (x) => {
  const t = clamp01(x)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
const r2 = (v) => +v.toFixed(2)
const r4 = (v) => +v.toFixed(4)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const rgb = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")
const mix = (a, b, t) => rgb(hex(a).map((v, i) => lerp(v, hex(b)[i], t)))
const shade = (c, k) => rgb(hex(c).map((v) => v * k))

export async function fetchDays(login, token) {
  const query = "query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}"
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "contribution-skyline" },
    body: JSON.stringify({ query, variables: { login } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors || !json.data?.user) throw new Error(JSON.stringify(json.errors ?? json))
  return json.data.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
  )
}

export function buildGrid(days) {
  const counts = new Map()
  for (const d of days) counts.set(d.date, (counts.get(d.date) ?? 0) + d.count)
  const end = Math.max(...days.map((d) => dayMs(d.date)))
  let start = end - 364 * DAY
  start -= new Date(start).getUTCDay() * DAY
  const cells = []
  for (let ms = start, i = 0; ms <= end; ms += DAY, i++) {
    const date = toKey(ms)
    cells.push({ date, count: counts.get(date) ?? 0, week: Math.floor(i / 7), day: i % 7 })
  }
  const nz = cells.map((c) => c.count).filter((c) => c > 0).sort((a, b) => a - b)
  const busy = nz.length ? nz[Math.floor(0.95 * (nz.length - 1))] : 0
  for (const c of cells) c.level = c.count <= 0 ? 0 : busy <= 0 ? 4 : 1 + Math.min(3, Math.floor((c.count / busy) * 4))
  return { cells, weeks: cells[cells.length - 1].week + 1, max: nz.length ? nz[nz.length - 1] : 0 }
}

export function computeStats(cells) {
  let total = 0
  let busiest = { count: 0, date: null }
  let run = 0
  let runStart = null
  let longest = { days: 0, start: null, end: null }
  for (const c of cells) {
    total += c.count
    if (c.count > busiest.count) busiest = { count: c.count, date: c.date }
    if (c.count > 0) {
      if (run === 0) runStart = c.date
      run++
      if (run > longest.days) longest = { days: run, start: runStart, end: c.date }
    } else run = 0
  }
  let j = cells.length - 1
  if (j >= 0 && cells[j].count === 0) j--
  const endAt = j
  while (j >= 0 && cells[j].count > 0) j--
  const days = endAt - j
  const current = days > 0 ? { days, start: cells[j + 1].date, end: cells[endAt].date } : { days: 0, start: null, end: null }
  return { total, first: cells[0].date, last: cells[cells.length - 1].date, busiest, longest, current }
}

export const barHeight = (count, max) => (count > 0 && max > 0 ? 0.4 + Math.pow(count / max, 0.85) * 7.2 : 0.2)

const camera = (e) => {
  const yaw = YAW * e
  const elev = lerp(Math.PI / 2, ELEV, e)
  return { cs: Math.cos(yaw), sn: Math.sin(yaw), se: Math.sin(elev), ce: Math.cos(elev) }
}

const mul = (A, B) => [
  A[0] * B[0] + A[2] * B[1],
  A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3],
  A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4],
  A[1] * B[4] + A[3] * B[5] + A[5],
]
const inv = ([a, b, c, d, e, f]) => {
  const k = a * d - b * c
  return [d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k]
}
const apply = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]
const matrix = (M, sep = ",") => "matrix(" + M.map(r4).join(sep) + ")"

export function render({ days, login, theme }) {
  const th = THEMES[theme]
  const { cells, weeks, max } = buildGrid(days)
  const stats = computeStats(cells)
  const n = cells.length
  const nf = new Intl.NumberFormat("en-US")
  const df = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  const dfy = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  const mf = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
  const wf = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" })
  const fmt = (f, d) => f.format(dayMs(d))
  const range = (a, b, f = df) => (a && b ? fmt(f, a) + " - " + fmt(f, b) : "-")
  const noun = (v, one, many) => (v === 1 ? one : many)
  const hgt = cells.map((c) => barHeight(c.count, max))

  const c1 = camera(1)
  const proj = (s, ox, oy, x, y, z) => [ox + s * (x * c1.cs - y * c1.sn), oy + s * ((x * c1.sn + y * c1.cs) * c1.se - z * c1.ce)]
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
  const grow = (x, y, z) => {
    const [px, py] = proj(1, 0, 0, x, y, z)
    minx = Math.min(minx, px)
    maxx = Math.max(maxx, px)
    miny = Math.min(miny, py)
    maxy = Math.max(maxy, py)
  }
  cells.forEach((c, i) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      grow(c.week + OFF + dx * CELL, c.day + OFF + dy * CELL, 0)
      grow(c.week + OFF + dx * CELL, c.day + OFF + dy * CELL, hgt[i])
    }
  })
  grow(0, 8.6, 0)
  grow(weeks, 8.6, 0)
  const aw = W - 2 * PX
  const ah = STAGE - 24
  const s3 = Math.min(aw / (maxx - minx), ah / (maxy - miny))
  const ox3 = PX + (aw - (maxx - minx) * s3) / 2 - minx * s3
  const oy3 = HEAD + 12 + (ah - (maxy - miny) * s3) / 2 - miny * s3
  const P = (x, y, z) => proj(s3, ox3, oy3, x, y, z)

  const p2 = (W - 2 * PX - GUTTER) / weeks
  const block2 = 18 + 7 * p2 + 30 + 66
  const x2 = PX + GUTTER
  const y2 = HEAD + (STAGE - block2) / 2 + 18
  const statsY2 = y2 + 7 * p2 + 30

  const center = [weeks / 2, 3.5]
  const M0 = [p2, 0, 0, p2, x2, y2]
  const camM = (e) => {
    const c = camera(e)
    const s = lerp(p2, s3, e)
    const L = [s * c.cs, s * c.sn * c.se, -s * c.sn, s * c.cs * c.se, 0, 0]
    const target = [lerp(apply(M0, ...center)[0], P(...center, 0)[0], e), lerp(apply(M0, ...center)[1], P(...center, 0)[1], e)]
    const at = apply(L, ...center)
    return [L[0], L[1], L[2], L[3], target[0] - at[0], target[1] - at[1]]
  }
  const Mf = camM(1)
  const MfInv = inv(Mf)
  const camKey = (e) => "transform:" + matrix(mul(camM(e), MfInv))

  const sec = (s) => r2((s / T) * 100) + "%"
  const SWING = [1.8, 3.2]
  const BACK = [12.6, 14]
  const RISE = [3.2, 4.3]
  const FALL = [10.5, 11.4]
  const steps = 12
  const camFrames = [`0%,${sec(SWING[0])}{${camKey(0)}}`]
  for (let k = 1; k < steps; k++) camFrames.push(`${sec(lerp(SWING[0], SWING[1], k / steps))}{${camKey(easeInOutCubic(k / steps))}}`)
  camFrames.push(`${sec(SWING[1])},${sec(BACK[0])}{${camKey(1)}}`)
  for (let k = 1; k < steps; k++) camFrames.push(`${sec(lerp(BACK[0], BACK[1], k / steps))}{${camKey(easeInOutCubic(1 - k / steps))}}`)
  camFrames.push(`${sec(BACK[1])},100%{${camKey(0)}}`)

  const easeOut = "animation-timing-function:cubic-bezier(.33,1,.68,1)"
  const easeIn = "animation-timing-function:cubic-bezier(.32,0,.67,0)"
  const ease = "animation-timing-function:cubic-bezier(.65,0,.35,1)"
  const twoWay = (name, off, on, inAt, outAt, d = 0.5) =>
    `@keyframes ${name}{0%,${sec(inAt)}{${off};${ease}}${sec(inAt + d)},${sec(outAt)}{${on};${ease}}${sec(outAt + d)},100%{${off}}}`
  const css = [
    `text{font-family:${FONT}}`,
    `.cam,.g,.l,.f2,.f3,.st,.sb{animation-duration:${T}s;animation-timing-function:linear;animation-iteration-count:infinite;animation-fill-mode:both;transform-box:view-box;transform-origin:0 0}`,
    `.cam{animation-name:cam}`,
    `.g{animation-name:grow;animation-delay:var(--d)}`,
    `.l{animation-name:lift;animation-delay:var(--d)}`,
    `.f2{opacity:0;animation-name:f2}`,
    `.f3{animation-name:f3}`,
    `.st{animation-name:st}`,
    `.sb{animation-name:sb}`,
    `@keyframes cam{${camFrames.join("")}}`,
    `@keyframes grow{0%,${sec(RISE[0])}{transform:scaleY(0);${easeOut}}${sec(RISE[1])},${sec(FALL[0])}{transform:scaleY(1);${easeIn}}${sec(FALL[1])},100%{transform:scaleY(0)}}`,
    `@keyframes lift{0%,${sec(RISE[0])}{transform:translateY(1px);${easeOut}}${sec(RISE[1])},${sec(FALL[0])}{transform:translateY(0);${easeIn}}${sec(FALL[1])},100%{transform:translateY(1px)}}`,
    `@keyframes f2{0%,${sec(SWING[0] - 0.2)}{opacity:1;${ease}}${sec(SWING[0] + 0.4)},${sec(BACK[1] - 0.3)}{opacity:0;${ease}}${sec(BACK[1] + 0.2)},100%{opacity:1}}`,
    twoWay("f3", "opacity:0", "opacity:1", 4.6, 10.1),
    twoWay("st", "opacity:0;transform:translateY(-10px)", "opacity:1;transform:translateY(0)", 4.8, 10, 0.6),
    twoWay("sb", "opacity:0;transform:translateY(10px)", "opacity:1;transform:translateY(0)", 5, 10, 0.6),
    `@media (prefers-reduced-motion:reduce){.cam,.g,.l,.f2,.f3,.st,.sb{animation:none}}`,
  ].join("\n")

  const empty = mix(th.bg, th.fg, th.emptyMix)
  const levels = [empty, ...th.palette]
  const accent = th.palette[3]
  const order = [...cells.keys()].sort((a, b) => cells[a].week + cells[a].day - (cells[b].week + cells[b].day) || a - b)

  const bars = order.map((i) => {
    const c = cells[i]
    const Hs = hgt[i] * c1.ce * s3
    const x0 = c.week + OFF
    const y0 = c.day + OFF
    const x1 = x0 + CELL
    const y1 = y0 + CELL
    const fill = levels[c.level]
    const face = (a, b, color) => {
      const o = P(...a, 0)
      const e = P(...b, 0)
      return `<g transform="${matrix([e[0] - o[0], e[1] - o[1], 0, Hs, o[0], o[1]], " ")}"><rect class="g" y="-1" width="1" height="1" fill="${color}"/></g>`
    }
    const top = mul([1, 0, 0, 1 / Hs, 0, 0], Mf)
    const delay = r2((c.week / Math.max(1, weeks - 1)) * 0.8 + (c.day / 6) * 0.1)
    return (
      `<g style="--d:${delay}s">` +
      face([x0, y1], [x1, y1], shade(fill, 0.84)) +
      face([x1, y0], [x1, y1], shade(fill, 0.68)) +
      `<g transform="matrix(1 0 0 ${r4(Hs)} 0 ${r4(-Hs)})"><g class="l"><rect transform="${matrix(top, " ")}" x="${r2(x0)}" y="${r2(y0)}" width="${CELL}" height="${CELL}" rx="0.12" fill="${fill}"/></g></g>` +
      `</g>`
    )
  })

  const months = []
  let prev = -1
  for (let w = 0; w < weeks; w++) {
    const m = +cells[w * 7].date.slice(5, 7)
    if (m !== prev) months.push({ week: w, label: fmt(mf, cells[w * 7].date) })
    prev = m
  }
  if (months.length > 1 && months[1].week - months[0].week < 3) months.shift()

  const labels2 = []
  for (const m of months) labels2.push(`<text x="${r2(x2 + (m.week + OFF) * p2)}" y="${r2(y2 - 7)}">${m.label}</text>`)
  for (let d = 0; d < 7; d++) {
    const dow = new Date(dayMs(cells[d].date)).getUTCDay()
    if (dow % 2) labels2.push(`<text x="${x2 - 7}" y="${r2(y2 + (d + 0.5) * p2)}" dy=".35em" text-anchor="end">${fmt(wf, cells[d].date)}</text>`)
  }
  const labels3 = []
  let edge = -Infinity
  for (const m of months) {
    const [x, y] = P(m.week + 0.5, 7.4, 0)
    if (x < edge) continue
    labels3.push(`<text x="${r2(x)}" y="${r2(y + 12)}">${m.label}</text>`)
    edge = x + 34
  }

  const blocks = [
    { label: "1 year total", value: nf.format(stats.total), unit: noun(stats.total, "contribution", "contributions"), sub: range(stats.first, stats.last, dfy) },
    { label: "Busiest day", value: nf.format(stats.busiest.count), unit: noun(stats.busiest.count, "contribution", "contributions"), sub: stats.busiest.date ? fmt(df, stats.busiest.date) : "-" },
    { label: "Longest streak", value: nf.format(stats.longest.days), unit: noun(stats.longest.days, "day", "days"), sub: range(stats.longest.start, stats.longest.end) },
    { label: "Current streak", value: nf.format(stats.current.days), unit: noun(stats.current.days, "day", "days"), sub: range(stats.current.start, stats.current.end) },
  ]
  const BIG = 44
  const stat = (b, x, y, anchor, size) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="13" fill="${th.muted}">${b.label}</text>` +
    `<text x="${x}" y="${y + 8 + size * 0.86}" text-anchor="${anchor}" fill="${th.fg}"><tspan font-size="${size}" font-weight="600" fill="${accent}" letter-spacing="-0.02em">${b.value}</tspan><tspan font-size="${Math.round(size * 0.34 + 1)}" dx="6">${b.unit}</tspan></text>` +
    `<text x="${x}" y="${y + 8 + size * 0.86 + 20}" text-anchor="${anchor}" font-size="12.5" fill="${th.muted}">${b.sub}</text>`
  const span = BIG * 0.86 + 28 + 26
  const corners =
    `<g class="st">${stat(blocks[0], W - PX, HEAD + 22, "end", BIG)}${stat(blocks[1], W - PX, HEAD + 22 + span, "end", BIG)}</g>` +
    `<g class="sb">${stat(blocks[2], PX, HEAD + STAGE - 14 - span * 2 + 26, "start", BIG)}${stat(blocks[3], PX, HEAD + STAGE - 14 - span + 26, "start", BIG)}</g>`
  const row2 = blocks.map((b, i) => stat(b, r2(x2 + (i * (W - PX - x2)) / 4), r2(statsY2 + 13), "start", 28)).join("")

  const legendX = W - PX
  const footY = HEAD + STAGE + 28
  const swatches = levels
    .map((c, i) => `<rect x="${legendX - 36 - (5 - i) * 15}" y="${footY - 10}" width="11" height="11" rx="2" fill="${c}"/>`)
    .join("")
  const title = `${nf.format(stats.total)} ${noun(stats.total, "contribution", "contributions")} in the last year`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title">
<title id="title">${esc(login)}: ${title}, shown as a heat map that rises into a 3D skyline</title>
<style>
${css}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${th.bg}" stroke="${th.border}"/>
<text x="${PX}" y="36" font-size="15" fill="${th.fg}"><tspan font-weight="600">${nf.format(stats.total)}</tspan> ${noun(stats.total, "contribution", "contributions")} in the last year</text>
<text x="${W - PX}" y="36" font-size="13" text-anchor="end" fill="${th.muted}">@${esc(login)}</text>
<g class="cam">${bars.join("")}</g>
<g class="f2" font-size="11" fill="${th.muted}">${labels2.join("")}${row2}</g>
<g class="f3" font-size="11" fill="${th.muted}">${labels3.join("")}</g>
${corners}
<line x1="${PX}" x2="${W - PX}" y1="${HEAD + STAGE}" y2="${HEAD + STAGE}" stroke="${th.border}"/>
<g font-size="12" fill="${th.muted}">
<text x="${PX}" y="${footY}">Rebuilt daily from GitHub contribution data</text>
<text x="${legendX - 36 - 5 * 15 - 6}" y="${footY}" text-anchor="end">Less</text>${swatches}<text x="${legendX}" y="${footY}" text-anchor="end">More</text>
</g>
</svg>
`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const login = process.env.GH_USER || process.env.GITHUB_REPOSITORY_OWNER
  const token = process.env.GITHUB_TOKEN
  if (!login || !token) throw new Error("GITHUB_TOKEN and GH_USER (or GITHUB_REPOSITORY_OWNER) are required")
  const out = process.argv[2] || "dist"
  const days = await fetchDays(login, token)
  mkdirSync(out, { recursive: true })
  for (const theme of Object.keys(THEMES)) writeFileSync(join(out, `skyline-${theme}.svg`), render({ days, login, theme }))
}
