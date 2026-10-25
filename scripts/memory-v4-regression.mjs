import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const ok = (value, message) => { if (!value) throw new Error(message) }
let checks = 0
const check = (value, message) => { ok(value, message); checks++ }

check(html.includes('const REMINDER_COMPLETED_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;'),
  'completed reminder prompt TTL is missing')
check(html.includes('now - (r.doneAt || r.dueAt || r.createdAt || 0) <= REMINDER_COMPLETED_CONTEXT_TTL_MS'),
  'completed reminders are not removed from prompt context after 24 hours')
check(html.includes('const active = rs.filter(r => !r.done);'),
  'active reminders are not protected from completed-card cleanup')
check(html.includes('entry.status = "archived";') && html.includes('function restoreMemEntry(id)'),
  'memory deletion is not reversible')
check(!html.includes('const next = list.filter(e => e.id !== id);'),
  'memory delete still hard-deletes the stored row')

const reminderStart = html.indexOf('function reminderStatusNote()')
const reminderEnd = html.indexOf('function addMemEntry(', reminderStart)
check(reminderStart >= 0 && reminderEnd > reminderStart, 'reminder status helper was not found')
const reminderNow = Date.now()
const reminderContext = {
  settings: { reminderEnabled: true },
  messages: [
    { role: 'reminder', text: '三天前已经做完', done: true, createdAt: reminderNow - 73 * 3600000, doneAt: reminderNow - 72 * 3600000, dueAt: reminderNow - 72 * 3600000 },
    { role: 'reminder', text: '今天刚做完', done: true, createdAt: reminderNow - 2 * 3600000, doneAt: reminderNow - 3600000, dueAt: reminderNow - 30 * 60000 },
    { role: 'reminder', text: '现在仍在进行', done: false, createdAt: reminderNow - 60 * 60000, dueAt: reminderNow + 30 * 60000 },
  ],
  REMINDER_COMPLETED_CONTEXT_TTL_MS: 24 * 60 * 60 * 1000,
  reminderTiming: () => ({ usedTxt: '01:00:00', diffTxt: '提前 1″' }),
  userRef: () => '惟惟',
  Date: { now: () => reminderNow },
  Math,
}
vm.createContext(reminderContext)
vm.runInContext(`${html.slice(reminderStart, reminderEnd)}
globalThis.statusNote = reminderStatusNote;`, reminderContext)
const reminderNote = reminderContext.statusNote()
check(reminderNote.includes('现在仍在进行') && reminderNote.includes('进行中，还剩约 30 分钟'),
  'active reminder is absent from the live prompt status')
check(reminderNote.includes('今天刚做完') && !reminderNote.includes('三天前已经做完'),
  'completed reminder TTL did not distinguish fresh and stale cards')

const tagStart = html.indexOf('const MEMORY_EMOTION_TAGS =')
const tagEnd = html.indexOf('function normalizedPromptFact(', tagStart)
check(tagStart >= 0 && tagEnd > tagStart, 'memory v4 tag and scoring helpers were not found')
const now = Date.now()
const context = {
  settings: { userName: '周惟惟', aiName: '顾祁砚', roles: [{ name: '顾祁砚' }] },
  activeRole: () => ({ id: 'gu', name: '顾祁砚' }),
  inferMemoryKind: text => String(text).includes('喜欢') ? 'preference' : 'fact',
  defaultMemoryAuthority: () => 'user_confirmed',
  uid: () => 'memory-id',
  MEM_STOP: new Set('的了我你他她它们是在有和就不都也很会要吗呢吧啊呀过着把被给让对从向跟与之啦哦嗯这那个么没还能想说去来上下又一'.split('')),
  recallSemanticAffinity: () => 0,
  Date: { now: () => now },
  Set,
}
vm.createContext(context)
vm.runInContext(`const MEMORY_ENTRY_SCHEMA_VERSION = 4;
${html.slice(tagStart, tagEnd)}
globalThis.v4 = { localMemoryTags, normalizeMemoryEntry, memTokens, memoryRecallScore };`, context)

const entry = { text: '周惟惟喜欢茉莉花茶，也很想念顾祁砚', source: 'manual', roleId: 'gu', recordedAt: now }
context.v4.normalizeMemoryEntry(entry)
check(entry.schemaVersion === 4 && entry.scope === 'backstage:gu', 'legacy entry did not receive v4 scope metadata')
check(entry.tags.some(tag => tag.axis === 'person' && tag.value === '周惟惟'), 'known-person tag was not derived locally')
check(entry.tags.some(tag => tag.axis === 'emotion' && tag.value === 'longing'), 'emotion tag was not derived locally')
const score = context.v4.memoryRecallScore('还记得周惟惟喜欢的茉莉花茶吗', context.v4.memTokens('周惟惟喜欢的茉莉花茶'), entry, true)
check(score.tagScore > 0 && score.score > score.lexical, 'weighted tag score did not affect recall rank')
check(score.reasons.some(reason => reason.includes('person') || reason.includes('keyword')), 'recall reason receipt is empty')

console.log(`memory v4 regression: ${checks} checks passed`)
