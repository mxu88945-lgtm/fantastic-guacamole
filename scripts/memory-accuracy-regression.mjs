import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0

const ok = (value, message) => {
  if (!value) throw new Error(message)
  checks++
}
const has = (text, message) => ok(html.includes(text), message)

has('const MEMORY_CONTEXT_CHAR_BUDGET = 6400;', 'shared memory budget is missing')
has('const MEMORY_RECALL_COOLDOWN_TURNS = 4;', 'recall cooldown is missing')
has('const MEMORY_RECALL_LEDGER_LIMIT = 120;', 'recall ledger is not bounded')
has('const RECENT_STATE_LOOKBACK_MS = 36 * 60 * 60 * 1000;', 'recent state lookback is missing')
has('const RECENT_STATE_CHAR_BUDGET = 1100;', 'recent state prompt budget is missing')
has('const queryText = currentMemoryRecallQuery();', 'recall still uses assistant echo text')
has('memory: boundedMemory.audit,', 'memory audit is absent from prompt diagnostics')
has('sourceMessageIds: Array.isArray(provenance?.sourceMessageIds)', 'memory provenance is not stored')
has('invalidateDerivedForRemovedMessages(messages.slice(idx), "edit-resend")', 'edit/resend does not invalidate derived memory')
has('invalidateDerivedForRemovedMessages(removed, "regenerate")', 'regenerate does not invalidate derived memory')
has('_originReplyId: baseMsg.id || ""', 'multi-bubble replies lack a stable derivation source')
has('const entries = activeMemoryEntries();', 'inactive memory versions are not filtered from prompts')
has('supersedeMemoryEntries(addition.replaces, entry.id);', 'changed facts do not supersede old versions')

const recallStart = html.indexOf('function currentMemoryRecallQuery(')
const recallEnd = html.indexOf('// Build the wire-format message list', recallStart)
ok(recallStart >= 0 && recallEnd > recallStart, 'recall helper section not found')

const archived = {
  id: 'old-tea', role: 'user', content: '惟惟一直喜欢茉莉花茶',
  _compactedBy: 'summary-1', ts: 1,
}
const conv = { id: 'c1', messages: [
  archived,
  { id: 'a1', role: 'assistant', content: '我记得你喜欢茉莉花茶', ts: 2 },
  { id: 'u1', role: 'user', content: '好呀', ts: 3 },
] }
const recallContext = {
  messages: conv.messages,
  settings: { aiName: '顾祁砚' },
  currentConv: () => conv,
  isChatContentMessage: m => !!m && (m.role === 'user' || m.role === 'assistant'),
  messageText: m => typeof m?.content === 'string' ? m.content : '',
  memTokens: text => new Set([...String(text || '').replace(/\s/g, '')]),
  memScore: (query, text) => [...query].filter(token => String(text).includes(token)).length,
  normalizedPromptFact: text => String(text || '').trim().toLowerCase(),
  clipUnicodeChars: (text, max) => [...String(text || '')].slice(0, max).join(''),
  userRef: () => '惟惟',
}
vm.createContext(recallContext)
vm.runInContext(
  `const MEMORY_RECALL_COOLDOWN_TURNS = 4;
   const MEMORY_RECALL_LEDGER_LIMIT = 120;
   const RECENT_STATE_LOOKBACK_MS = 36 * 60 * 60 * 1000;
   const RECENT_STATE_MAX_ITEMS = 8;
   const RECENT_STATE_CHAR_BUDGET = 1100;
   ${html.slice(recallStart, recallEnd)}
   globalThis.recallHelpers = {
     currentMemoryRecallQuery, explicitMemoryRecallIntent,
     filterRecallCooldown, commitRecallKeys, retrieveOmittedCurrentChat,
     recentStateCandidateText, buildRecentStateContext,
   };`,
  recallContext,
)
const recall = recallContext.recallHelpers
ok(recall.currentMemoryRecallQuery() === '好呀', 'latest user message is not the sole recall query')
ok(!recall.retrieveOmittedCurrentChat({ omitted: [] }).text, 'assistant self-echo triggered old recall')

const lunch = { id: 'lunch', role: 'user', content: '中午吃了白饭、鱼肉、卤蛋、青菜和菇汤', ts: Date.now() - 3600000 }
conv.messages.push(lunch)
conv.messages.push({ id: 'lunch-follow-up', role: 'user', content: '那中午呢', ts: Date.now() })
ok(recall.currentMemoryRecallQuery().includes('中午吃了白饭')
  && recall.currentMemoryRecallQuery().includes('当前追问：那中午呢'),
  'vague temporal follow-up did not inherit its previous subject')
const recentState = recall.buildRecentStateContext({ messages: [{ id: 'lunch-follow-up' }] })
ok(recentState.includes('白饭、鱼肉、卤蛋、青菜和菇汤'),
  'omitted same-day meal was not bridged by recent working memory')
ok(!recall.buildRecentStateContext({ messages: [lunch, { id: 'lunch-follow-up' }] }).includes('白饭'),
  'recent working memory duplicated a meal already present in wire history')
conv.messages.splice(-2)

conv.messages.push({ id: 'u2', role: 'user', content: '你还记得茉莉花茶吗', ts: 4 })
let result = recall.retrieveOmittedCurrentChat({ omitted: [] })
ok(result.selectedCount === 1 && result.keys[0] === 'current:old-tea', 'explicit old-memory query did not recall the source')
recall.commitRecallKeys(result.keys, result.turn)

conv.messages.push({ id: 'u3', role: 'user', content: '今天茉莉花茶怎么样', ts: 5 })
result = recall.retrieveOmittedCurrentChat({ omitted: [] })
ok(result.selectedCount === 0 && result.suppressedCount === 1, 'repeat recall was not cooled down')

conv.messages.push({ id: 'u4', role: 'user', content: '上次的茉莉花茶呢', ts: 6 })
result = recall.retrieveOmittedCurrentChat({ omitted: [] })
ok(result.selectedCount === 1, 'explicit recall did not bypass cooldown')

const budgetStart = html.indexOf('function memoryContextInstructionLine(')
const budgetEnd = html.indexOf('// Active history search:', budgetStart)
ok(budgetStart >= 0 && budgetEnd > budgetStart, 'memory budget helper section not found')
const committed = []
const budgetContext = {
  messages: [],
  settings: { memSummary: '惟惟喜欢茉莉花茶', notionEnabled: true },
  retrieveOmittedCurrentChat: () => ({
    text: '【本窗旧文】\n惟惟喜欢茉莉花茶', keys: ['current:1'], turn: 8,
    candidateCount: 1, selectedCount: 1, suppressedCount: 0,
  }),
  retrieveCrossChat: () => ({
    text: '【跨窗旧文】\n惟惟喜欢散步', keys: ['cross:1'], turn: 8,
    candidateCount: 1, selectedCount: 1, suppressedCount: 1,
  }),
  buildRecentStateContext: () => '',
  buildLockedMemoryForPrompt: () => '- 惟惟害怕的不是离开，而是仍在却不认得她',
  rollingSummaryPrompt: () => '【连续性档案】\n惟惟喜欢茉莉花茶\n关系轻松亲密',
  buildMemoryForPrompt: () => '- 惟惟喜欢茉莉花茶\n- 惟惟长期养鹦鹉',
  privateDiaryPrompt: () => '【私人日记】\n我很在意她',
  privateDiaryWritePrompt: () => '【私记写入】仅当本轮有新的明确情绪转折时写入。',
  activeRole: () => ({}),
  buildNotionForPrompt: () => '惟惟喜欢茉莉花茶\n项目仍在继续',
  userRef: () => '惟惟',
  memoryFactNearDuplicate: (text, rows) => rows.some(row => row.text === text),
  commitRecallKeys: (keys, turn) => committed.push({ keys, turn }),
}
vm.createContext(budgetContext)
vm.runInContext(
  `const MEMORY_CONTEXT_CHAR_BUDGET = 6400;
   const RECENT_STATE_CHAR_BUDGET = 1100;
   const LOCKED_MEMORY_CHAR_BUDGET = 1200;
   ${html.slice(budgetStart, budgetEnd)}
   globalThis.budgetHelpers = { buildBoundedMemoryContext, clipMemoryContextBlock };`,
  budgetContext,
)
const bounded = budgetContext.budgetHelpers.buildBoundedMemoryContext({})
ok(budgetContext.budgetHelpers.clipMemoryContextBlock('x'.repeat(9000), 6400).length === 6400,
  'line-safe clipping did not enforce the exact ceiling')
ok(bounded.text.length <= 6400, 'memory context exceeded its shared budget')
ok(bounded.audit.used <= bounded.audit.budget, 'memory audit reports an over-budget prompt')
ok(bounded.text.includes('【私记写入】'), 'private diary write rule was dropped from the shared budget')
ok(bounded.audit.duplicateLines >= 2, 'cross-layer duplicate facts were not removed')
ok(bounded.audit.cooldownSuppressed === 1, 'cooldown suppression was not included in audit')
ok(committed.length === 2, 'included recall sources were not committed to cooldown')

const invalidationStart = html.indexOf('function supersedeMemoryEntries(')
const invalidationEnd = html.indexOf('// Ask the model to synthesize', invalidationStart)
ok(invalidationStart >= 0 && invalidationEnd > invalidationStart, 'derived-memory invalidation section not found')
const entries = [
  { id: 'm1', text: 'from discarded reply', status: 'active', sourceConvId: 'c1', sourceMessageId: 'base-reply' },
  { id: 'm2', text: 'unrelated', status: 'active', sourceConvId: 'c1', sourceMessageId: 'keep' },
]
const diary = [
  { id: 'd1', text: 'discarded feeling', status: 'active', sourceConvId: 'c1', sourceMessageId: 'base-reply' },
]
const role = { id: 'r1', memEntries: entries, privateDiary: diary }
const invalidationContext = {
  settings: { roles: [role] },
  currentId: 'c1',
  currentConv: () => ({ id: 'c1', roleId: 'r1' }),
  activeRole: () => role,
  memList: () => entries,
  memoryEntryIsActive: entry => entry.status === 'active',
  rolePrivateDiary: () => diary,
  saveSettings() {},
  Date,
  Set,
}
vm.createContext(invalidationContext)
vm.runInContext(
  `${html.slice(invalidationStart, invalidationEnd)}
   globalThis.invalidationHelpers = {
     supersedeMemoryEntries, invalidateDerivedForRemovedMessages,
   };`,
  invalidationContext,
)
let invalidated = invalidationContext.invalidationHelpers.invalidateDerivedForRemovedMessages(
  [{ id: 'visible-segment', _originReplyId: 'base-reply' }], 'regenerate')
ok(invalidated.memories === 1 && entries[0].status === 'invalidated', 'discarded reply memory stayed active')
ok(invalidated.diary === 1 && diary[0].status === 'invalidated', 'discarded reply diary stayed active')
ok(entries[1].status === 'active', 'unrelated memory was invalidated')

entries[1].status = 'active'
const superseded = invalidationContext.invalidationHelpers.supersedeMemoryEntries(['m2'], 'm3')
ok(superseded === 1 && entries[1].supersededBy === 'm3', 'old fact version was not archived')

const versionStart = html.indexOf('function explicitMemoryChangeInTranscript(')
const versionEnd = html.indexOf('async function autoUpdateMemory(', versionStart)
ok(versionStart >= 0 && versionEnd > versionStart, 'fact-version validation section not found')
const versionContext = {
  memTokens: text => new Set([...String(text || '')]),
  memScore: (query, text) => [...query].filter(token => String(text).includes(token)).length,
}
vm.createContext(versionContext)
vm.runInContext(
  `${html.slice(versionStart, versionEnd)}
   globalThis.versionHelpers = { validatedMemoryReplacementIds };`,
  versionContext,
)
const oldFacts = [{ id: 'coffee', text: '惟惟喜欢喝咖啡' }]
ok(versionContext.versionHelpers.validatedMemoryReplacementIds(
  { text: '惟惟现在不再喝咖啡', replaces: ['coffee'] }, oldFacts, '惟惟说：我现在不再喝咖啡',
).includes('coffee'), 'explicit changed preference did not supersede its old version')
ok(versionContext.versionHelpers.validatedMemoryReplacementIds(
  { text: '惟惟不喝咖啡', replaces: ['coffee'] }, oldFacts, '今天聊到咖啡',
).length === 0, 'implicit text incorrectly superseded a durable fact')
ok(sw.includes('const CACHE = "role-chat-cache-v148";'), 'service worker cache was not bumped to v148')

console.log(`memory accuracy regression: ${checks} checks passed`)
