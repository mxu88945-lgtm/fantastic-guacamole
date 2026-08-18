import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0

const ok = (value, message) => {
  if (!value) throw new Error(message)
  checks++
}

ok(html.includes('const LOCKED_MEMORY_MAX_ITEMS = 12;'), 'locked memory item bound is missing')
ok(html.includes('const LOCKED_MEMORY_CHAR_BUDGET = 1200;'), 'locked memory budget is missing')
ok(html.includes('function toggleMemLock(id)'), 'locked memory control is missing')
ok(html.includes('【用户高权重锁定·每轮必须携带】'), 'locked prompt lane is missing')
ok(html.includes('{ key: "locked", label: "🔒 高权重锁定", priority: 1'), 'locked lane is not first priority')
ok(html.includes('entry => !entry.locked && requested.has(entry.id)'), 'automatic replacement can still overwrite a lock')
ok(html.includes('label: "Notion相关档案", priority: 6'), 'Notion does not receive a protected pre-summary slot')
ok(html.includes('召回 ${block.recallSelected || 0} / 候选 ${block.recallCandidates}'), 'recall inspection remains ambiguous')
ok(sw.includes('const CACHE = "role-chat-cache-v157";'), 'service worker cache was not bumped to v157')

console.log(`memory lock regression: ${checks} checks passed`)
