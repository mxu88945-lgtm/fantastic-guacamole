import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const slice = (start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end, a)
  assert.ok(a >= 0 && b > a, `missing source section ${start}`)
  return html.slice(a, b)
}
const now = Date.now()
const archived = { id: 'archived', role: 'user', content: '茉莉花茶的约定：\n下次一起去山间喝茶。', ts: now - 10000, _compactedBy: 'summary' }
const otherRole = { id: 'other-raw', role: 'assistant', content: '米米今天洗澡了。\n它是一只小鹦鹉，特别喜欢玩水。', ts: now - 5000, _compactedBy: 'other-summary' }
const current = { id: 'current', roleId: 'gu', title: '现在窗口', messages: [{ id: 'query', role: 'user', content: '茉莉花茶', ts: now }] }
const old = { id: 'old', roleId: 'gu', title: '去年窗口', messages: [archived, { id: 'summary', role: 'assistant', content: '这段摘要不应该被当成旧原文证据。', _summary: true }] }
const other = { id: 'other', roleId: 'shen', title: '其他角色窗口', messages: [otherRole, { id: 'event', role: 'assistant', content: '系统事件米米', _event: true }] }
const context = {
  conversations: [current, old, other], messages: current.messages,
  settings: { activeRoleId: 'gu', aiName: '顾祁砚', crossChat: true, historyRecallScope: 'all', historyRecallAliases: '米米|小米|小鹦鹉', roles: [{ id: 'gu', aiName: '顾祁砚' }, { id: 'shen', aiName: '沈衍' }] },
  currentConv: () => current, userRef: () => '惟惟',
  messageText: m => m?.content || '', messageImages: () => [],
  clipUnicodeChars: (s, limit) => Array.from(String(s)).slice(0, limit).join(''),
  isChatContentMessage: m => !!m && ['user', 'assistant'].includes(m.role) && !m._summary && !m._event,
  Date,
}
vm.createContext(context)
vm.runInContext(slice('const MEM_STOP =', 'function normalizedPromptFact('), context)
vm.runInContext(`const MEMORY_RECALL_COOLDOWN_TURNS = 4;
  const MEMORY_RECALL_LEDGER_LIMIT = 120;
  const RECENT_STATE_LOOKBACK_MS = 36 * 60 * 60 * 1000;
  const RECENT_STATE_MAX_ITEMS = 8;
  const RECENT_STATE_CHAR_BUDGET = 1100;
  const RECALL_NEIGHBOR_CHAR_BUDGET = 520;
  ${slice('function currentMemoryRecallQuery(', '// Build the wire-format message list')}`, context)
vm.runInContext(slice('function retrieveCrossChat(', 'function memoryContextInstructionLine('), context)
vm.runInContext(slice('function searchHistoryRecall(', '// Web search via'), context)
context.normalizedPromptFact = s => String(s || '').trim().toLowerCase()

let result = context.retrieveCrossChat()
assert.equal(result.selectedCount, 1, 'a plain keyword must automatically recall an archived other-window message')
assert.ok(result.text.includes(archived.content), 'short matched messages must retain all original paragraphs')
assert.ok(result.text.includes('去年窗口') && result.text.includes('old|archived'), 'source window and message identifiers must survive')
assert.ok(!result.text.includes('这段摘要不应该'), 'summaries must not become verbatim evidence')
assert.ok(result.text.length <= 1400, 'automatic evidence must stay in budget')

current.messages[0].content = '小米'
result = context.retrieveCrossChat()
assert.equal(result.selectedCount, 1, 'alias keywords must automatically find other-role archived originals')
assert.ok(result.text.includes(otherRole.content) && result.text.includes('沈衍'), 'other-role attribution and raw wording must be preserved')
context.settings.historyRecallScope = 'role'
assert.equal(context.retrieveCrossChat().selectedCount, 0, 'role-only scope must exclude other-role windows')
assert.equal(context.readHistoryOriginal('other|other-raw|0').sources.length, 0, 'direct reads must respect the same scope')
context.settings.historyRecallScope = 'all'
assert.equal(context.readHistoryOriginal('other|other-raw|0').sources.length, 1, 'global direct read must include other-role windows')
context.settings.crossChat = false
assert.equal(context.retrieveCrossChat().selectedCount, 0, 'automatic recall off switch must be respected')
assert.equal(context.searchHistoryRecall('小米').selectedCount, 1, 'active search remains independent of automatic recall switch')
context.settings.crossChat = true
for (const ack of ['好呀', '嗯嗯', '收到', '谢谢啦']) {
  current.messages[0].content = ack
  assert.equal(context.retrieveCrossChat().selectedCount, 0, `acknowledgement ${ack} should not revive unrelated history`)
}
current.messages[0].content = '茉莉花茶'
result = context.retrieveCrossChat()
context.commitRecallKeys(result.keys, result.turn)
current.messages.push({ id: 'follow', role: 'user', content: '茉莉花茶很好喝', ts: now + 1 })
assert.equal(context.retrieveCrossChat().selectedCount, 0, 'ordinary repeat matches should honor cooldown')
current.messages.push({ id: 'explicit', role: 'user', content: '你还记得茉莉花茶吗', ts: now + 2 })
assert.equal(context.retrieveCrossChat().selectedCount, 1, 'an explicit recall request must bypass cooldown')

const long = { id: 'long', role: 'assistant', content: '前段。'.repeat(1000) + '米米完整原话的关键细节。\n' + '🙂末尾段。'.repeat(1300), ts: now + 3, _compactedBy: 's2' }
other.messages.push(long)
result = context.searchHistoryRecall('米米')
assert.ok(result.text.includes('米米完整原话的关键细节'), 'oversized hits must center on the matching passage')
assert.ok(result.text.includes('原文过长') && result.text.length <= 8000, 'truncation must be explicit and bounded')
const chars = Array.from(long.content)
let read = context.readHistoryOriginal('other|long|0')
assert.ok(read.text.includes(chars.slice(0, 6000).join('')), 'first page must preserve the exact original')
assert.ok(read.text.includes('[旧文:other|long|6000]'), 'long originals need an explicit next-page reference')
read = context.readHistoryOriginal('other|long|6000')
assert.ok(read.text.includes(chars.slice(6000).join('')) && read.text.includes('读取至末尾'), 'following page must complete the original without dropped unicode')
for (const ref of ['missing|long|0', 'other|event|0', 'old|summary|0', 'other|long|-1', 'other|long|NaN'])
  assert.equal(context.readHistoryOriginal(ref).sources.length, 0, `invalid or non-chat original ${ref} must be rejected`)
const tiny = context.packHistoryRecall({ hits: [{ c: other, m: long, key: 'k' }], query: '米米' }, 150)
assert.equal(tiny.selectedCount, 0, 'a budget too small for evidence must report zero sources')
assert.equal(tiny.text, '', 'tiny budget must not send metadata as if it were original evidence')
const message = {}
context.mergeMessageHistoryRecall(message, result.sources)
context.mergeMessageHistoryRecall(message, result.sources)
assert.equal(message.historyRecall.sources.length, result.sources.length, 'repeated tool rounds must not inflate the receipt')
// Exercise the real final-budget assembly, rather than assuming ranked hits all fit.
Object.assign(context, {
  buildRecentStateContext: () => '', buildPendingContinuityBridge: () => '',
  rollingSummaryPrompt: () => '【连续性档案】\n这是一份累计摘要。',
  buildLockedMemoryForPrompt: () => '', buildMemoryForPrompt: () => '',
  buildDerivedMemoryForPrompt: () => '', privateDiaryPrompt: () => '',
  privateDiaryWritePrompt: () => '', activeRole: () => ({ id: 'gu' }),
  memoryFactNearDuplicate: () => false, sessionStorage: { setItem() {} },
})
vm.runInContext(`const MEMORY_CONTEXT_CHAR_BUDGET = 6400;
  const LOCKED_MEMORY_CHAR_BUDGET = 1200;
  const PENDING_CONTINUITY_BRIDGE_CHAR_BUDGET = 900;
  let lastMemoryInspection = null;
  ${slice('function memoryContextInstructionLine(', '// Active history search:')}`, context)
current.messages[current.messages.length - 1].content = '小米'
let bounded = context.buildBoundedMemoryContext({ omitted: [], messages: current.messages })
let cross = bounded.audit.blocks.find(block => block.key === 'crossExact')
assert.ok(bounded.text.length <= 6400, 'full memory assembly must respect its shared ceiling')
assert.equal(cross.recallSelected, cross.sources.length, 'receipt must count only the packed source messages')
assert.ok(cross.sources.length > 0 && bounded.text.includes('米米完整原话'), 'global raw evidence must reach the actual model context')
// Fill earlier protected lanes to leave too little room for a later cross-window hit.
context.buildLockedMemoryForPrompt = () => '锚'.repeat(5000)
context.privateDiaryWritePrompt = () => '规'.repeat(5000)
context.buildRecentStateContext = () => '近'.repeat(5000)
context.buildPendingContinuityBridge = () => '桥'.repeat(5000)
const hugeCurrent = { id: 'huge', role: 'user', content: '米米'.repeat(2500), _compactedBy: 's3' }
current.messages.unshift(hugeCurrent)
current.messages.push({ id: 'explicit-global', role: 'user', content: '你还记得小米吗' })
bounded = context.buildBoundedMemoryContext({ omitted: [], messages: current.messages.slice(-1) })
cross = bounded.audit.blocks.find(block => block.key === 'crossExact')
assert.ok(bounded.text.length <= 6400, 'crowded context must still stay bounded')
assert.equal(cross.recallSelected, cross.sources.length, 'budget clipping must not inflate the cross-window receipt')
assert.ok(html.includes('旧聊天检索范围') && html.includes('已召回 '), 'scope and receipt must be visible in the UI')

console.log('global history recall: archived windows, aliases, scopes, cooldown, exact Unicode pages and receipts passed')
