import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const requireText = (text, message) => {
  if (!html.includes(text)) throw new Error(message)
}

requireText('const AUTO_COMPACT_KEEP = 36;', 'recent verbatim retention was not expanded')
requireText('const ROLLING_SUMMARY_VERSION = 2;', 'continuity summary version is missing')
requireText('【关系与当下情绪】', 'relationship/emotion layer is missing from the summary schema')
requireText('【人物表达与互动锚点】', 'voice/interaction anchors are missing from the summary schema')
requireText('【重要原话与专属称呼】', 'important quotes and names are missing from the summary schema')
requireText('【未完事项与隐性张力】', 'unfinished tension layer is missing from the summary schema')
requireText('m._compactedBy || m._summary', 'summary cards are still eligible for wire history')
requireText('const continuityNote = rollingSummaryPrompt(messages);', 'continuity archive is not injected as system context')
requireText('await maybeUpgradeRollingSummary(currentConv());', 'legacy compressed windows are not upgraded before reply')
requireText('const archived = messages.filter(m => isChatContentMessage(m) && m._compactedBy);', 'archived raw turns are absent from topical recall')

const helperStart = html.indexOf('function isChatContentMessage(')
const helperEnd = html.indexOf('async function compactMessageBatch(', helperStart)
if (helperStart < 0 || helperEnd < 0) throw new Error('rolling summary helper section not found')

const context = {
  ROLLING_SUMMARY_VERSION: 2,
  ROLLING_SUMMARY_CHAR_LIMIT: 2000,
  ROLLING_SUMMARY_MAX_TOKENS: 2200,
  COMPACT_TRANSCRIPT_CHAR_BUDGET: 16000,
  autoCompactInFlight: false,
  abortController: null,
  messageText: m => typeof m?.content === 'string' ? m.content : '',
  messageImages: () => [],
  nameFor: role => role,
  memoryRuntimeConfig: () => ({ apiKey: 'test' }),
  completeOnce: async () => [
    '【事实与时间线】', '- 已从旧原文重建',
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
if (!upgraded || currentSummary._summaryVersion !== 2) {
  throw new Error('legacy summary was not upgraded from preserved raw turns')
}
if (!currentSummary.content.includes('【人物表达与互动锚点】')) {
  throw new Error('upgraded summary lost the structured continuity schema')
}

if (!sw.includes('const CACHE = "role-chat-cache-v114";')) {
  throw new Error('service worker cache was not bumped for memory continuity v2')
}

console.log('memory continuity regression: 17 checks passed')
