import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0
const ok = (value, message) => {
  if (!value) throw new Error(message)
  checks++
}

ok(html.includes('id="sidebar-special-days"'), 'sidebar important-days entry is missing')
ok(html.includes('id="special-days-panel"'), 'important-days panel is missing')
ok(html.includes('if (!Array.isArray(role.specialDays)) role.specialDays = [];'),
  'role-private important-days storage is not migrated safely')
ok(html.includes('$("sidebar-special-days").onclick = () => { openSpecialDaysPanel();'),
  'sidebar important-days entry is not wired')
ok(html.includes('saveSettings();\n  resetSpecialDayForm();\n  renderSpecialDays();'),
  'important-day saves are not persisted and rerendered')
ok(html.includes('不会发送给模型'), 'important-days privacy copy no longer explains zero prompt usage')

const start = html.indexOf('function parseLocalDay(')
const end = html.indexOf('function roleSpecialDays(', start)
ok(start >= 0 && end > start, 'important-day date helpers were not found')
const context = { Date }
vm.runInNewContext(`${html.slice(start, end)}\nglobalThis.days = { parseLocalDay, nextSpecialDayAt, specialDayDistance };`, context)

const birthday = { date: '2020-03-05', annual: true }
ok(context.days.specialDayDistance(birthday, new Date(2026, 2, 1, 12)) === 4,
  'annual birthday countdown is incorrect')
ok(context.days.specialDayDistance(birthday, new Date(2026, 2, 5, 12)) === 0,
  'same-day birthday is not recognized')
ok(context.days.nextSpecialDayAt(birthday, new Date(2026, 2, 6, 12)).getFullYear() === 2027,
  'past annual date does not roll into next year')
ok(context.days.specialDayDistance({ date: '2026-03-01', annual: false }, new Date(2026, 2, 5, 12)) === -4,
  'one-time past date distance is incorrect')
ok(context.days.parseLocalDay('2026-02-30') === null, 'invalid calendar date was accepted')
ok(sw.includes('const CACHE = "role-chat-cache-v123";'), 'service worker cache was not bumped to v123')

console.log(`special days regression: ${checks} checks passed`)
