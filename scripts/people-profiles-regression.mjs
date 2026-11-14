import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

// v354 人物档案：标签解析、去重、身份隔离、召回注入、原话带日期、越用越记得。
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const slice = (start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end, a)
  assert.ok(a >= 0 && b > a, `missing source section ${start}`)
  return html.slice(a, b)
}
let checks = 0
const ok = (value, message) => { assert.ok(value, message); checks++ }

// ---- source wiring ----
ok(sw.includes('const CACHE = "role-chat-cache-v371";'), 'service worker cache was not bumped to v354')
ok(html.includes('id="people-list"') && html.includes('id="people-add"'), 'settings → 记忆 has no 人物档案 editor')
ok(/"peopleProfiles","peopleProfilesSeededV1"/.test(html), 'people profiles are not cloud-synced settings')
ok(html.includes('key: "people", label:'), 'people block is not part of the bounded memory budget / 本轮记忆检查')
ok(html.includes('renderPeopleProfiles();') && html.includes('function renderPeopleProfiles('), 'people editor is not rendered with settings')
ok(html.includes('textHtml = textHtml.replace(/(?:\\[|【)\\s*人物\\s*[:：]'), 'people marker is not hidden while streaming')
ok((html.match(/extractPeopleMarkers\(assistantMsg\.content, assistantMsg\.id, peopleWritable\)/g) || []).length === 2,
  'people markers are not captured in both partial and final reply paths')
ok(html.includes('const peopleWritable = !independent && !replyProject && !backstageMode;'), 'RP / independent isolation guard missing')
ok(html.includes('「你那天说…」'), 'model is not told to quote with 「你那天说…」')

// ---- runtime ----
const DAY = 86400000
const now = Date.now()
const today = new Date(now)
const todayLabel = `${today.getMonth() + 1}月${today.getDate()}日`
const old = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5, 21, 10).getTime()
const oldLabel = (() => { const d = new Date(old); return (d.getFullYear() !== today.getFullYear() ? d.getFullYear() + '年' : '') + `${d.getMonth() + 1}月${d.getDate()}日` })()

const pastWindow = { id: 'past', roleId: 'gu', title: '上周窗口', messages: [
  { id: 'p0', role: 'assistant', content: '今天忙完了吗？', ts: old - 60000 },
  { id: 'p1', role: 'user', content: '伯恩说他下个月要搬去深圳工作了', ts: old },
  { id: 'p2', role: 'assistant', content: '那你们见面会少一点吧。', ts: old + 60000 },
  { id: 'p3', role: 'assistant', content: '伯恩是我最好的兄弟。', ts: old + 120000 },
] }
const rpWindow = { id: 'rp', roleId: 'gu', space: 'roleplay', title: '剧场', messages: [
  { id: 'r1', role: 'user', content: '伯恩在戏里是反派', ts: old },
] }
const current = { id: 'cur', roleId: 'gu', title: '现在', messages: [
  { id: 'c1', role: 'user', content: '伯恩今天帮我修好了键盘', ts: now },
] }
let seq = 0, saves = 0
const memEntries = [
  { id: 'm1', text: '伯恩是陪惟惟修端口的人', status: 'active', importance: 0.6, updatedAt: now - DAY },
  { id: 'm2', text: '惟惟喜欢茉莉花茶', status: 'active', updatedAt: now - DAY },
]
const settings = { activeRoleId: 'gu', aiName: '顾祁砚', crossChat: true, historyRecallScope: 'role', historyRecallAliases: '', roles: [{ id: 'gu', aiName: '顾祁砚' }] }
const context = {
  settings, conversations: [current, pastWindow, rpWindow], messages: current.messages, currentId: 'cur',
  currentConv: () => current, userRef: () => '惟惟',
  messageText: m => (typeof m?.content === 'string' ? m.content : ''), messageImages: () => [],
  clipUnicodeChars: (s, n) => Array.from(String(s)).slice(0, n).join(''),
  isChatContentMessage: m => !!m && ['user', 'assistant'].includes(m.role) && !m._summary && !m._event,
  isRoleplayConversation: () => false,
  uid: () => 'id-' + (++seq),
  saveSettings: () => { saves++ }, showToast() {},
  activeMemoryEntries: () => memEntries.filter(e => e.status === 'active'), memList: () => memEntries,
  escapeHtml: s => String(s), $: () => null, confirm: () => true,
  Date, Math, setTimeout: () => 0, clearTimeout() {}, console,
}
vm.createContext(context)
vm.runInContext(slice('const MEM_STOP =', 'function normalizedPromptFact('), context)
vm.runInContext(slice('function normalizedPromptFact(', 'function takePromptItems('), context)
vm.runInContext(`const MEMORY_RECALL_COOLDOWN_TURNS = 4;
  const MEMORY_RECALL_LEDGER_LIMIT = 120;
  const RECENT_STATE_LOOKBACK_MS = 36 * 60 * 60 * 1000;
  const RECENT_STATE_MAX_ITEMS = 8;
  const RECENT_STATE_CHAR_BUDGET = 1100;
  const RECALL_NEIGHBOR_CHAR_BUDGET = 520;
  ${slice('const mainChatRecallIndexByConversation = new WeakMap();', '// Build the wire-format message list')}`, context)
vm.runInContext(`${slice('// ---------- 人物档案 (people profiles, v354) ----------', '// ---------- /人物档案 ----------')}
globalThis.people = { peopleList, findPersonByName, extractPeopleMarkers, buildPeopleProfileContext,
  recordMemoryUsage, peopleWritePrompt, addPersonEvent, memoryUsageBonus };`, context)
const P = context.people

// presets
const seeded = P.peopleList().map(p => p.name)
for (const name of ['顾屿', '裴屿', '伯恩', '顾祁砚'])
  ok(seeded.includes(name), `preset person ${name} missing`)
ok(P.peopleList().every(p => p.background === '' && p.events.length === 0), 'presets must start with empty background')
ok(settings.peopleProfilesSeededV1 === true, 'seed flag not set')
settings.peopleProfiles = settings.peopleProfiles.filter(p => p.name !== '裴屿')
ok(!P.peopleList().some(p => p.name === '裴屿'), 'a deleted preset came back')

// marker → event on existing person, hidden from display
let shown = P.extractPeopleMarkers('真好，键盘又能用了。\n[人物:伯恩|帮她修好了键盘]', 'reply-1')
ok(shown === '真好，键盘又能用了。', 'people marker leaked into visible reply')
let burn = P.findPersonByName('伯恩')
ok(burn.events.length === 1 && burn.events[0].text === '帮她修好了键盘', 'existing person did not get an event')
ok(/^\d{4}-\d{2}-\d{2}$/.test(burn.events[0].date) && burn.events[0].sourceMessageId === 'reply-1', 'event is missing date or provenance')
const savesBefore = saves
P.extractPeopleMarkers('【人物：伯恩｜帮她修好了键盘】', 'reply-2')
ok(burn.events.length === 1, 'duplicate event was appended twice')
ok(saves === savesBefore, 'duplicate marker should not trigger a save')

// 背景： fills an empty background
P.extractPeopleMarkers('[人物:伯恩|背景：她多年的朋友，也是一起写代码的伙伴]', 'reply-3')
ok(burn.background.startsWith('她多年的朋友'), 'background marker did not fill empty background')

// new person mentioned by her → created with background
current.messages.push({ id: 'c2', role: 'user', content: '我朋友薯条下周要来潮州玩', ts: now + 1 })
P.extractPeopleMarkers('好期待。[人物:薯条|她的朋友，下周来潮州玩]', 'reply-4')
const fries = P.findPersonByName('薯条')
ok(fries && fries.background.includes('她的朋友') && fries.events.length === 0, 'new person was not created from marker')

// assistant self-talk / unmentioned names never enter the archive
shown = P.extractPeopleMarkers('我想起来了。[人物:沈衍|是我的前世]', 'reply-5')
ok(shown === '我想起来了。' && !P.findPersonByName('沈衍'), 'a name she never mentioned was learned from the assistant')
ok(P.extractPeopleMarkers('[人物:伯恩|在戏里当了反派]', 'reply-6', false) === '' && burn.events.length === 1,
  'RP / backstage marker must be stripped without writing')
// marker cap per reply
current.messages.push({ id: 'c3', role: 'user', content: '伯恩和薯条和顾屿昨天一起吃饭，伯恩还请客了', ts: now + 2 })
P.extractPeopleMarkers('[人物:伯恩|请大家吃饭][人物:薯条|和伯恩吃饭][人物:顾屿|和伯恩吃饭][人物:伯恩|喝了奶茶]', 'reply-7')
ok(!burn.events.some(e => e.text === '喝了奶茶'), 'more than three people markers were written in one reply')
ok(P.peopleWritePrompt().includes('[人物:名字|一句话]') && P.peopleWritePrompt().includes('只记她说的事实'), 'write prompt is missing')

// alias matching
burn.aliases = ['恩恩']
current.messages.push({ id: 'c4', role: 'user', content: '恩恩最近好像很累', ts: now + 3 })
current.messages.push({ id: 'c5', role: 'assistant', content: '要不要问问他？', ts: now + 4 })
current.messages.push({ id: 'c6', role: 'user', content: '嗯，明天问问', ts: now + 5 })
let block = P.buildPeopleProfileContext()
ok(block.people.length === 1 && block.people[0].name === '伯恩', 'alias in her previous message did not recall the person')

// full recall block
current.messages.push({ id: 'c7', role: 'user', content: '对了伯恩那件事你还记得吗', ts: now + 6 })
block = P.buildPeopleProfileContext()
const text = block.text
ok(text.startsWith('【人物档案·她最近提到的人】') && text.includes('▸ 伯恩（也叫：恩恩）'), 'people block header missing')
ok(text.includes('背景：她多年的朋友'), 'background missing from recall')
ok(text.includes(`- ${todayLabel} 帮她修好了键盘`), 'dated recent event missing from recall')
ok(text.includes(`${oldLabel} 她说：伯恩说他下个月要搬去深圳工作了`), 'cross-window quote is not dated as 「M月D日 她说」')
ok(text.includes(`（前一句）${oldLabel} 他说：今天忙完了吗`) && text.includes(`（后一句）${oldLabel} 他说：那你们见面会少一点吧`), 'quote neighbors (±1) missing')
ok(!text.includes('伯恩是我最好的兄弟'), 'assistant self-statement became person evidence')
ok(!text.includes('戏里是反派'), 'RP transcript leaked into main-chat people recall')
ok(text.includes('相关长期记忆') && text.includes('伯恩是陪惟惟修端口的人'), 'related long-term memory missing')
ok(text.includes('「你那天说…」'), 'quote guidance missing from people block')
const sections = text.split('\n▸ ')
ok(sections.every(section => section.length <= 1000), 'a person section exceeded its budget')

// at most three people, 800 chars each
const distinct = ['买了一台新相机准备拍鸟', '去广州出差三天', '发烧在家休息', '换到一家游戏公司上班', '养了一只橘猫叫团子',
  '报名了马拉松半程', '和女朋友分手了', '搬进了海边的新公寓', '开始学做潮汕牛肉丸', '在直播里唱了一整晚歌']
distinct.forEach(item => P.addPersonEvent(burn, item))
ok(burn.events.length >= 12, 'distinct events were wrongly merged as duplicates')
current.messages.push({ id: 'c8', role: 'user', content: '伯恩、薯条、顾屿、顾祁砚今天都在群里说话', ts: now + 7 })
block = P.buildPeopleProfileContext()
ok(block.people.length === 3, 'more than three people were injected')
ok(block.text.split('▸ ').slice(1).every(section => section.replace(/\n【人物档案说明】[\s\S]*$/, '').length <= 820), 'per-person 800 char budget exceeded')
ok((block.text.match(/^- \d+月\d+日 第/mg) || []).length <= 5, 'more than five events were injected for one person')

// usage counting: once per turn, capped bonus
current.messages.push({ id: 'c9', role: 'user', content: '伯恩呢', ts: now + 8 })
block = P.buildPeopleProfileContext()
const ref = block.eventRefs[0]
ok(ref, 'no event refs reported for usage counting')
const event = burn.events.find(e => e.id === ref.eventId)
P.recordMemoryUsage({ memoryIds: ['m1'], eventRefs: [ref], personIds: [burn.id] })
P.recordMemoryUsage({ memoryIds: ['m1'], eventRefs: [ref], personIds: [burn.id] })
ok(event.hitCount === 1 && event.lastUsedAt > 0, 'event hitCount must bump once per turn')
ok(memEntries[0].hitCount === 1 && memEntries[0].lastUsedAt > 0, 'long-term memory hitCount/lastUsedAt not recorded')
ok(memEntries[1].hitCount === undefined, 'an uninjected memory was counted')
current.messages.push({ id: 'c10', role: 'user', content: '下一轮', ts: now + 9 })
P.recordMemoryUsage({ memoryIds: ['m1'] })
ok(memEntries[0].hitCount === 2, 'next turn did not count again')
ok(P.memoryUsageBonus({ hitCount: 100000, lastUsedAt: Date.now() }) <= 0.6, 'usage bonus is not capped')
ok(P.memoryUsageBonus({ hitCount: 50, lastUsedAt: Date.now() - 400 * DAY }) < 0.1, 'stale memories are not down-weighted')
ok(P.memoryUsageBonus({}) === 0, 'unused memories got a bonus')
ok(memEntries.length === 2, 'down-weighting must never delete memories')

// existing history evidence uses the same dated format
const packed = context.packHistoryRecall({ hits: [{ c: pastWindow, m: pastWindow.messages[1], key: 'k' }], query: '伯恩' }, 1400)
ok(packed.text.includes(`${oldLabel} 她说：伯恩说他下个月`) && packed.text.includes('「你那天说…」'), 'history recall evidence is not dated 「M月D日 她说」')

console.log(`people profiles regression: ${checks} checks passed`)
