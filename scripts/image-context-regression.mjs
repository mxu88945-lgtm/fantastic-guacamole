// v376: runtime check that image base64 never crowds the history window and that
// old pictures leave the wire as one short line (with the 图记 memo when there is one).
import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')

function extractFunction(name) {
  const start = html.search(new RegExp(`\\n(?:async )?function ${name}\\(`))
  if (start < 0) throw new Error(`function ${name} not found`)
  let i = html.indexOf('{', html.indexOf(')', start))
  // walk to the matching close brace of the body (skip strings/regex/template roughly)
  let depth = 0, inStr = null
  for (; i < html.length; i++) {
    const c = html[i], prev = html[i - 1]
    if (inStr) { if (c === inStr && prev !== '\\') inStr = null; continue }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return html.slice(start, i + 1) }
  }
  throw new Error(`unterminated ${name}`)
}
const memoBlock = html.slice(html.indexOf('/* image-memo:start'), html.indexOf('/* image-memo:end */'))
const names = ['estimateTextTokens', 'estimateContentTokens', 'messagePromptTokens', 'newestVisualUserMessage',
  'roleRunCount', 'buildApiHistoryWindow', 'toApiContent', 'mergeApiContent', 'apiContentHasValue', 'apiMessagesFor']
const ctx = {
  REFERENCE_FILE_PROMPT_CHAR_BUDGET: 8000, REFERENCE_FILE_FOLLOWUP_CHAR_BUDGET: 1200,
  CHAT_HISTORY_TOKEN_BUDGET: 8200, COMPACTED_HISTORY_TOKEN_BUDGET: 7800,
  CHAT_HISTORY_MESSAGE_CAP: 96, CHAT_HISTORY_MIN_ROLE_RUNS: 10,
  messages: [],
  activeRollingSummary: () => null,
  isNoReplyPlaceholder: () => false,
  hasReferenceAttachment: () => false,
  sendContent: m => m.content,
  fileAwareContentOrder: c => c,
  filePromptText: p => p.text || '',
  isRoleplayConversation: () => false,
  stripRoleplayPresentationalHtmlForPrompt: s => s,
}
vm.createContext(ctx)
vm.runInContext(memoBlock + '\n' + names.map(extractFunction).join('\n') + '\nthis.__api = { buildApiHistoryWindow, apiMessagesFor, imageMemoTarget, extractImageMemo, stripImageMemoTags };', ctx)
const api = ctx.__api

const bigBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(1_200_000) // ~1.2 MB photo
const img = (extra = {}) => ({ type: 'image', dataUrl: bigBase64, previewDataUrl: 'data:image/jpeg;base64,BB', ...extra })
let n = 0
const msgs = []
for (let i = 0; i < 40; i++) {
  msgs.push({ id: 'u' + (++n), role: 'user', content: '今天第' + i + '句话，记得我说过的事情' })
  msgs.push({ id: 'a' + (++n), role: 'assistant', content: '嗯，我记得第' + i + '句。' })
}
// two old photos in the middle of history: one with a memo, one without
msgs.splice(40, 0, { id: 'p1', role: 'user', content: [{ type: 'text', text: '看我的玄凤' }, img({ memo: '一只黄脸玄凤站在她手指上' })] })
msgs.splice(41, 0, { id: 'p1r', role: 'assistant', content: '好可爱' })
msgs.splice(60, 0, { id: 'p2', role: 'user', content: [img()] })
msgs.splice(61, 0, { id: 'p2r', role: 'assistant', content: '收到' })
ctx.messages = msgs

// 1) Text-only newest turn: old photos must cost marker tokens only, window keeps lots of text
let win = api.buildApiHistoryWindow()
if (win.historyTokens > 8200) throw new Error('history window over budget')
const wire = JSON.stringify(api.apiMessagesFor(false, win.messages))
if (wire.includes('base64')) throw new Error('old image base64 re-sent on a later text turn')
if (!wire.includes('【此前发过的图片：一只黄脸玄凤站在她手指上】')) throw new Error('old image memo not carried as text')
if (!wire.includes('【此前发送过一张图片】')) throw new Error('old image without memo lost its marker')
const keptWithoutImages = win.messages.length

// 2) Newest turn is a photo: exactly that one goes out as pixels, still counted ~1200 tokens, not as 1.2MB text
msgs.push({ id: 'p3', role: 'user', content: [{ type: 'text', text: '这张呢' }, img()] })
win = api.buildApiHistoryWindow()
if (win.historyTokens > 8200) throw new Error('newest photo blew the history budget')
if (keptWithoutImages - win.messages.length > 3) throw new Error('newest photo evicted too much real conversation')
const wire2 = api.apiMessagesFor(false, win.messages)
const pixelCount = JSON.stringify(wire2).split('"type":"image_url"').length - 1
if (pixelCount !== 1) throw new Error('expected exactly one image sent as pixels, got ' + pixelCount)
if (wire2[wire2.length - 1].role !== 'user' || !JSON.stringify(wire2[wire2.length - 1]).includes('image_url'))
  throw new Error('newest photo dropped from the request')

// 3) 图记 tag: prompt target, extraction and streaming hide
if (api.imageMemoTarget(msgs) !== msgs[msgs.length - 1].content[1]) throw new Error('memo target should be the new photo')
const ex = api.extractImageMemo('哇这只好胖\n[图记：一只灰色玄凤在啃纸巾]')
if (ex.text !== '哇这只好胖' || ex.memo !== '一只灰色玄凤在啃纸巾') throw new Error('图记 extraction failed: ' + JSON.stringify(ex))
if (api.stripImageMemoTags('好看[图记:一只', true) !== '好看') throw new Error('half-written 图记 visible while streaming')
msgs[msgs.length - 1].content[1].memo = 'x'
if (api.imageMemoTarget(msgs)) throw new Error('memo prompt should not repeat once memo is saved')

console.log('image context regression: 12 checks passed')
