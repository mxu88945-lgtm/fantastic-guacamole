import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message)
}

requireText('const AUTO_COMPACT_THRESHOLD = 180;', 'automatic compaction still triggers too early')
requireText('const AUTO_COMPACT_KEEP = 72;', 'recent verbatim retention was not doubled')
requireText('AUTO_COMPACT_THRESHOLD - AUTO_COMPACT_KEEP', 'automatic compaction batch is not derived from both limits')
requireText('最近 " + AUTO_COMPACT_KEEP + " 条保持原样', 'success notice can drift from the retention setting')
requireText('const ROLLING_SUMMARY_VERSION = 3;', 'continuity summary version is missing')
requireText('const RECENT_STATE_LOOKBACK_MS = 36 * 60 * 60 * 1000;', 'recent working-memory window is missing')
requireText('【近期生活状态与报备】', 'short-lived daily state is missing from the summary schema')
requireText('【关系与当下情绪】', 'relationship/emotion layer is missing from the summary schema')
requireText('【人物表达与互动锚点】', 'voice/interaction anchors are missing from the summary schema')
requireText('【重要原话与专属称呼】', 'important quotes and names are missing from the summary schema')
requireText('【未完事项与隐性张力】', 'unfinished tension layer is missing from the summary schema')
requireText('m._compactedBy || m._summary', 'summary cards are still eligible for wire history')
requireText('const boundedMemory = buildBoundedMemoryContext(historyWindow);', 'bounded layered memory context is not injected')
requireText('const recentState = buildRecentStateContext(historyWindow);', 'recent daily state is not injected into bounded memory')
requireText('【角色身份连续性】你始终是当前系统设定中的「', 'role identity continuity guard is missing')
if (html.includes('await maybeUpgradeRollingSummary(currentConv());')) {
  throw new Error('legacy summary rebuild still spends a separate model call during send')
}
requireText('naturally become v3 the next time normal rolling compaction is actually due',
  'lazy legacy-summary upgrade policy is undocumented')
requireText('const archived = messages.filter(m => isChatContentMessage(m) && m._compactedBy);', 'archived raw turns are absent from topical recall')
requireText('const COMPACT_TRANSCRIPT_BYTE_BUDGET = 24000;', 'UTF-8 compaction budget is missing')
requireText('const COMPACT_TRANSCRIPT_RETRY_BYTE_BUDGET = 12000;', 'safe retry budget is missing')
requireText('useMemoryApi && resp.status === 400 && !retriedShortTranscript', 'strict JSON relay retry is missing')
requireText('const transientStatuses = new Set([429, 500, 502, 503, 504]);', 'one-shot maintenance requests do not retry transient failures')
requireText('maxCompletionTokensRequired(detail)', 'new-model completion token compatibility is missing')
requireText('const AUTO_COMPACT_RETRY_COOLDOWN_MS = 5 * 60 * 1000;', 'failed automatic compaction has no retry cooldown')
requireText('autoCompactRetryAfter.set(conv.id, Date.now() + AUTO_COMPACT_RETRY_COOLDOWN_MS)', 'failed automatic compaction can retry after every reply')
requireText('"🧭 对话满 " + AUTO_COMPACT_THRESHOLD + " 条', 'automatic compaction notice can drift from its threshold')

const helperStart = html.indexOf('function isChatContentMessage(')
const helperEnd = html.indexOf('async function compactMessageBatch(', helperStart)
if (helperStart < 0 || helperEnd < 0) throw new Error('rolling summary helper section not found')

const context = {
  ROLLING_SUMMARY_VERSION: 3,
  ROLLING_SUMMARY_CHAR_LIMIT: 2400,
  ROLLING_SUMMARY_MAX_TOKENS: 2200,
  COMPACT_TRANSCRIPT_BYTE_BUDGET: 24000,
  COMPACT_TRANSCRIPT_RETRY_BYTE_BUDGET: 12000,
  autoCompactInFlight: false,
  abortController: null,
  messageText: m => typeof m?.content === 'string' ? m.content : '',
  messageImages: () => [],
  nameFor: role => role,
  memoryRuntimeConfig: () => ({ apiKey: 'test' }),
  completeOnce: async () => [
    '【事实与时间线】', '- 已从旧原文重建',
    '【近期生活状态与报备】', '- 午餐已经吃过',
    '【关系与当下情绪】', '- 关系仍连续',
    '【人物表达与互动锚点】', '- 保留原有语气',
    '【重要原话与专属称呼】', '- 有',
    '【未完事项与隐性张力】', '- 继续承接',
  ].join('\n'),
  conversations: [],
  currentId: 'not-current',
  saveConversations() {},
  renderMessages() {},
  scrollToBottom() {},
  showToast() {},
  console,
}
vm.runInNewContext(
  `${html.slice(helperStart, helperEnd)}
   globalThis.memoryHelpers = {
     activeRollingSummary, rollingSummaryText, rollingSummaryPrompt,
     archivedMessagesForSummary, maybeUpgradeRollingSummary,
     normalizeMemoryTransportText, utf8ByteLength, clipUtf8, compactTranscript,
   };`,
  context,
)

const oldSummary = {
  id: 'summary-old',
  role: 'assistant',
  content: '🗜️ **之前对话的累计摘要**\n\n- 旧版内容',
  _summary: true,
  _compactedBy: 'summary-current',
}
const currentSummary = {
  id: 'summary-current',
  role: 'assistant',
  content: '🧭 **较早对话·连续性档案**\n\n【关系与当下情绪】\n- 仍在意',
  _summary: true,
}
const archivedRaw = {
  id: 'raw-1',
  role: 'user',
  content: '真正的旧原文',
  _compactedBy: 'summary-old',
}
const conv = { messages: [archivedRaw, oldSummary, currentSummary] }
context.conversations = [conv]
const helpers = context.memoryHelpers

if (helpers.activeRollingSummary(conv.messages)?.id !== 'summary-current') {
  throw new Error('active summary chain resolution failed')
}
if (!helpers.rollingSummaryText(currentSummary).startsWith('【关系与当下情绪】')) {
  throw new Error('summary display heading was not stripped from system context')
}
if (!helpers.rollingSummaryPrompt(conv.messages).includes('不是任何一方说过的一条聊天消息')) {
  throw new Error('summary is not clearly separated from dialogue history')
}
const archived = helpers.archivedMessagesForSummary(conv, currentSummary)
if (archived.length !== 1 || archived[0].id !== 'raw-1') {
  throw new Error('multi-generation archived raw chain was not recovered')
}
currentSummary._summaryVersion = 1
const upgraded = await helpers.maybeUpgradeRollingSummary(conv)
if (!upgraded || currentSummary._summaryVersion !== 3) {
  throw new Error('legacy summary was not upgraded from preserved raw turns')
}
if (!currentSummary.content.includes('【人物表达与互动锚点】')) {
  throw new Error('upgraded summary lost the structured continuity schema')
}

const hasLoneSurrogate = text => {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = text.charCodeAt(i + 1)
      if (next < 0xDC00 || next > 0xDFFF) return true
      i++
    } else if (code >= 0xDC00 && code <= 0xDFFF) return true
  }
  return false
}
const malformed = `开头\uD83D中间\uDC00结尾`
const repaired = helpers.normalizeMemoryTransportText(malformed)
if (hasLoneSurrogate(repaired) || repaired !== '开头�中间�结尾') {
  throw new Error('lone UTF-16 surrogates were not repaired')
}
const clipped = helpers.clipUtf8('惟惟😀'.repeat(100), 101)
if (hasLoneSurrogate(clipped) || helpers.utf8ByteLength(clipped) > 101) {
  throw new Error('UTF-8 clipping split an emoji or exceeded its byte budget')
}
const unicodeBatch = Array.from({ length: 108 }, (_, i) => ({
  role: i % 2 ? 'assistant' : 'user',
  content: `${'汉字'.repeat(150)}😀第${i}条`,
}))
const transcript = helpers.compactTranscript(unicodeBatch, currentSummary)
if (hasLoneSurrogate(transcript) || helpers.utf8ByteLength(transcript) > 24000) {
  throw new Error('compaction transcript is not transport-safe or bounded')
}
JSON.stringify({ messages: [{ role: 'user', content: transcript }] })

// The normal chat stream already tolerated relay failures, but maintenance calls
// historically did not. Exercise the actual one-shot implementation with a fake
// OpenAI-compatible endpoint: parameter correction, cached capability, transient
// retry, and array-shaped content must all work without touching conversation data.
const completionHelperStart = html.indexOf('function compatibleTemperature(')
const completionHelperEnd = html.indexOf('async function streamChat(', completionHelperStart)
const completeOnceStart = html.indexOf('async function completeOnce(')
const completeOnceEnd = html.indexOf('// Ask the model to extract durable facts', completeOnceStart)
if (completionHelperStart < 0 || completionHelperEnd < 0 || completeOnceStart < 0 || completeOnceEnd < 0) {
  throw new Error('one-shot completion helper section not found')
}
const storage = new Map()
Object.assign(context, {
  settings: { provider: 'openai', apiKey: 'chat-key' },
  DEFAULTS: { openai: { baseUrl: 'https://relay.test/v1', model: 'gpt-5-test' } },
  memoryRuntimeConfig: () => ({
    provider: 'openai', baseUrl: 'https://relay.test/v1', apiKey: 'memory-key', model: 'gpt-5-test',
  }),
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
  setTimeout: fn => { fn(); return 1 },
})
vm.runInNewContext(
  html.slice(completionHelperStart, completionHelperEnd)
    + '\n' + html.slice(completeOnceStart, completeOnceEnd),
  context,
)
const badResponse = (status, detail) => ({ ok: false, status, text: async () => detail })
const goodResponse = data => ({ ok: true, status: 200, json: async () => data })
let queued = [
  badResponse(400, "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead."),
  goodResponse({ choices: [{ message: { content: [
    { type: 'reasoning', text: 'private analysis' },
    { type: 'text', text: '压缩完成' },
  ] } }] }),
]
const requestBodies = []
context.fetch = async (_url, init) => {
  requestBodies.push(JSON.parse(init.body))
  return queued.shift()
}
const compatibleResult = await context.completeOnce('system', 'transcript', 2200, true)
if (compatibleResult !== '压缩完成') throw new Error('array-shaped completion content was not normalized')
if (!Object.hasOwn(requestBodies[0], 'max_tokens')
    || !Object.hasOwn(requestBodies[1], 'max_completion_tokens')
    || Object.hasOwn(requestBodies[1], 'max_tokens')) {
  throw new Error('max_completion_tokens compatibility retry did not rewrite the request')
}
requestBodies.length = 0
queued = [badResponse(503, 'relay overloaded'), goodResponse({ choices: [{ message: { content: '重试成功' } }] })]
const retryResult = await context.completeOnce('system', 'transcript', 2200, true)
if (retryResult !== '重试成功' || requestBodies.length !== 2) {
  throw new Error('transient one-shot completion retry failed')
}
if (!Object.hasOwn(requestBodies[0], 'max_completion_tokens')) {
  throw new Error('learned max_completion_tokens capability was not reused')
}

const compactBatchStart = html.indexOf('async function compactMessageBatch(')
const compactBatchEnd = html.indexOf('async function maybeAutoCompactConversation(', compactBatchStart)
if (compactBatchStart < 0 || compactBatchEnd < 0) throw new Error('compaction mutation section not found')
let savedAfterFailure = false
const failureTurns = [
  { id: 'turn-1', role: 'user', content: '第一句' },
  { id: 'turn-2', role: 'assistant', content: '第二句' },
]
const failureConversation = { id: 'failure-conv', messages: failureTurns }
Object.assign(context, {
  AUTO_COMPACT_THRESHOLD: 180,
  AUTO_COMPACT_KEEP: 72,
  conversations: [failureConversation],
  currentId: 'failure-conv',
  messages: failureTurns,
  stickBottom: false,
  uid: () => 'unexpected-summary-id',
  saveConversations: () => { savedAfterFailure = true },
  completeOnce: async () => { throw new Error('relay unavailable') },
})
vm.runInNewContext(html.slice(compactBatchStart, compactBatchEnd), context)
const failedCompaction = await context.compactMessageBatch(failureConversation, failureTurns.slice(), true)
if (failedCompaction || savedAfterFailure || failureConversation.messages.length !== 2
    || failureTurns.some(message => message._compactedBy)) {
  throw new Error('failed compaction mutated or saved preserved raw messages')
}

if (!sw.includes('const CACHE = "role-chat-cache-v147";')) {
  throw new Error('service worker cache was not bumped for lazy summary upgrade')
}

console.log('memory continuity regression: 47 checks passed')
