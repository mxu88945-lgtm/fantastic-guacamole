import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0
const ok = (value, message) => {
  if (!value) throw new Error(message)
  checks++
}

ok(html.includes('id="companion-tab-ledger"'), 'ledger tab is missing')
ok(html.includes('id="ledger-open-list"'), 'open ledger list is missing')
ok(html.includes('{ key: "commitmentLedger", label: "惦记与约定账本", priority: 2'),
  'ledger is not protected inside the shared memory budget')
ok(html.includes('extractCompanionLedgerControls(assistantMsg.reasoning, assistantMsg.id)'),
  'hidden-channel ledger markers are not captured')
ok(html.includes('if (!independent && (!replyProject || backstageMode))'),
  'RP scene isolation guard is missing')

const start = html.indexOf('function roleCommitmentLedger(')
const end = html.indexOf('function updateMailboxBadge(', start)
ok(start >= 0 && end > start, 'ledger helper section not found')

let seq = 0
const role = { id: 'role-1', name: '顾祁砚', commitmentLedger: [] }
const context = {
  Date,
  currentId: 'chat-1',
  settings: { aiName: '顾祁砚' },
  activeRole: () => role,
  ensureRoleCompanionData: value => {
    if (!Array.isArray(value.commitmentLedger)) value.commitmentLedger = []
    return value
  },
  uid: () => `id-${++seq}`,
  saveSettings() {},
  showToast() {},
  renderCommitmentLedger() {},
  isRoleplayConversation: () => false,
  currentMemoryRecallQuery: () => '明早任务卡修好了吗',
  memTokens: text => new Set([...String(text || '').replace(/\s/g, '')]),
  parseLocalDay: value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null
  },
  companionTime: () => '',
  escapeHtml: value => String(value),
  confirm: () => true,
  document: { querySelectorAll: () => [] },
  $: () => null,
}
vm.createContext(context)
vm.runInContext(`${html.slice(start, end)}
globalThis.ledger = {
  upsertCommitmentLedger, resolveCommitmentLedger, extractCompanionLedgerControls,
  companionLedgerPrompt, companionLedgerWritePrompt, ledgerMatchScore,
};`, context)

let visible = context.ledger.extractCompanionLedgerControls(
  '好，明早我陪你检查。\n[约定:明早陪惟惟检查任务卡|2026-10-27]', 'reply-1')
ok(visible === '好，明早我陪你检查。', 'promise marker leaked into visible reply')
ok(role.commitmentLedger.length === 1 && role.commitmentLedger[0].status === 'open',
  'promise marker did not create an open ledger item')
ok(role.commitmentLedger[0].dueAt > 0 && role.commitmentLedger[0].sourceMessageId === 'reply-1',
  'promise provenance or due date is missing')

context.ledger.extractCompanionLedgerControls('[约定:明早陪惟惟检查任务卡|2026-10-27]', 'reply-2')
ok(role.commitmentLedger.length === 1, 'duplicate promise created a second ledger item')

const prompt = context.ledger.companionLedgerPrompt()
ok(prompt.includes('明早陪惟惟检查任务卡') && prompt.includes('不要逐条报账'),
  'open promise is not injected with anti-recitation guidance')

context.ledger.extractCompanionLedgerControls('[了结:任务卡检查]', 'reply-3')
ok(role.commitmentLedger[0].status === 'done' && role.commitmentLedger[0].resolvedAt,
  'completion marker did not resolve the matching ledger item')
ok(context.ledger.companionLedgerPrompt() === '', 'resolved item stayed in the active prompt')

ok(sw.includes('const CACHE = "role-chat-cache-v268";'), 'service worker cache was not bumped for ledger release')

console.log(`commitment ledger regression: ${checks} checks passed`)
