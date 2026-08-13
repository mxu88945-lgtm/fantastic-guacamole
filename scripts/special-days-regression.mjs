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
ok(html.includes('进入 7 天范围后，每天只给模型一条极短提醒'),
  'important-days copy does not explain the bounded model reminder')
ok(html.includes('specialDayClaim = buildSpecialDaysPromptClaim(activeRole());'),
  'normal chat does not claim an upcoming important-day reminder')
ok(html.includes('if (delta && specialDayClaim) {\n      markSpecialDaysPromptDelivered(specialDayClaim);'),
  'normal chat does not wait for returned model content before marking the reminder')
ok((html.match(/markSpecialDaysPromptDelivered\(specialDayClaim\);/g) || []).length >= 4,
  'proactive model paths do not mark successful important-day reminders')

const start = html.indexOf('function parseLocalDay(')
const end = html.indexOf('let editingSpecialDayId', start)
ok(start >= 0 && end > start, 'important-day date helpers were not found')
const delivered = new Map()
const context = {
  Date,
  localStorage: {
    getItem: key => delivered.get(key) ?? null,
    setItem: (key, value) => delivered.set(key, String(value)),
  },
  ensureRoleCompanionData: role => role,
  activeRole: () => null,
}
vm.runInNewContext(`${html.slice(start, end)}\nglobalThis.days = {
  parseLocalDay, nextSpecialDayAt, specialDayDistance,
  buildSpecialDaysPromptClaim, markSpecialDaysPromptDelivered
};`, context)

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

const role = { id: 'role-a', specialDays: [
  { id: 'birthday', title: '惟惟生日', kind: 'birthday', date: '2020-03-05', annual: true, createdAt: 1 },
] }
const nearClaim = context.days.buildSpecialDaysPromptClaim(role, new Date(2026, 2, 1, 12))
ok(nearClaim.text.includes('惟惟生日（生日）：3月5日，还有 4 天'),
  'nearby important day is not included in the short model reminder')
ok(!delivered.has(nearClaim.key), 'building a reminder incorrectly marks it delivered before model success')
context.days.markSpecialDaysPromptDelivered(nearClaim)
ok(context.days.buildSpecialDaysPromptClaim(role, new Date(2026, 2, 1, 18)).text === '',
  'same-role reminder is sent more than once per local calendar day')
ok(context.days.buildSpecialDaysPromptClaim(role, new Date(2026, 2, 2, 12)).text.includes('还有 3 天'),
  'nearby reminder does not become eligible again on the next local day')
ok(context.days.buildSpecialDaysPromptClaim(role, new Date(2026, 1, 20, 12)).text === '',
  'far-away important days consume prompt tokens')

const todayRole = { id: 'role-today', specialDays: [
  { title: '在一起', kind: 'anniversary', date: '2020-03-05', annual: true },
] }
ok(context.days.buildSpecialDaysPromptClaim(todayRole, new Date(2026, 2, 5, 12)).text.includes('就是今天，第 6 周年'),
  'same-day anniversary does not tell the model the anniversary count')
ok(sw.includes('const CACHE = "role-chat-cache-v155";'), 'service worker cache was not bumped to v155')

console.log(`special days regression: ${checks} checks passed`)
