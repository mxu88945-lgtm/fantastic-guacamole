// v376/v377: runtime check of how pictures reach the model.
// - the current turn's picture goes to the MAIN model as real vision content (no 读图模型 needed)
// - it is sent only on its own turn (and on 重新生成 of that turn); next turn it is archived to one 图记 line
// - an explicit recall ("那张图", or naming something in a 图记) re-attaches exactly one original for that turn only
// - image turns never evict normal conversation from the history window, and nothing image-related accumulates
import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')

function extractFunction(name) {
  const start = html.search(new RegExp(`\\n(?:async )?function ${name}\\(`))
  if (start < 0) throw new Error(`function ${name} not found`)
  let i = html.indexOf('{', html.indexOf(')', start))
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
const names = ['estimateTextTokens', 'estimateContentTokens', 'messagePromptTokens', 'liveImageReserveTokens',
  'roleRunCount', 'buildApiHistoryWindow', 'toApiContent', 'mergeApiContent', 'apiContentHasValue', 'apiMessagesFor',
  'geminiPartsForContent', 'geminiContentsFor']
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
vm.runInContext(memoBlock + '\n' + names.map(extractFunction).join('\n')
  + '\nthis.__api = { buildApiHistoryWindow, apiMessagesFor, geminiContentsFor, imageMemoTarget, extractImageMemo, stripImageMemoTags, findRecallImage, pastImagePromptText, imageMemoPrompt };', ctx)
const api = ctx.__api
let checks = 0
const ok = (cond, msg) => { if (!cond) throw new Error(msg); checks++ }

const bigBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(1_200_000) // ~1.2 MB photo
const img = (extra = {}) => ({ type: 'image', dataUrl: bigBase64, previewDataUrl: 'data:image/jpeg;base64,BB', ...extra })
const base = () => {
  const out = []
  for (let i = 0; i < 40; i++) {
    out.push({ id: 'u' + i, role: 'user', content: '今天第' + i + '句话，记得我说过的事情' })
    out.push({ id: 'a' + i, role: 'assistant', content: '嗯，我记得第' + i + '句。' })
  }
  return out
}
const pixels = wire => JSON.stringify(wire).split('"type":"image_url"').length - 1
const anthropicPixels = wire => JSON.stringify(wire).split('"type":"image"').length - 1
const geminiPixels = wire => JSON.stringify(wire).split('"inlineData"').length - 1
const request = () => { const w = api.buildApiHistoryWindow(); return { w, wire: api.apiMessagesFor(false, w.messages) } }

// --- A. history kept with an image turn == history kept with the same text-only turn
const textOnly = [...base(), { id: 'n', role: 'user', content: '这张呢' }]
ctx.messages = textOnly
const winText = api.buildApiHistoryWindow()
const withImage = [...base(), { id: 'n', role: 'user', content: [{ type: 'text', text: '这张呢' }, img()] }]
ctx.messages = withImage
const winImage = api.buildApiHistoryWindow()
ok(JSON.stringify(winText.messages.map(m => m.id)) === JSON.stringify(winImage.messages.map(m => m.id)),
  'an image turn changed which history messages are kept')
ok(winText.historyTokens === winImage.historyTokens, 'current-turn pixels are counted inside the history budget')
ok(winImage.imageReserveTokens === 1200 && !winText.imageReserveTokens, 'image tokens are not reserved outside the history budget')

// --- B. main model gets the picture as real vision content when no 读图模型 is set (desc absent)
let wire = api.apiMessagesFor(false, winImage.messages)
ok(pixels(wire) === 1, 'OpenAI-format main model did not get the image as image_url')
ok(anthropicPixels(api.apiMessagesFor(true, winImage.messages)) === 1, 'Anthropic main model did not get a base64 image block')
ok(geminiPixels(api.geminiContentsFor(winImage.messages)) === 1, 'Gemini main model did not get inlineData')
const last = JSON.stringify(wire[wire.length - 1])
ok(last.includes(api.imageMemoPrompt()), '图记 instruction is not in the image turn tail')
ok(api.imageMemoPrompt().length <= 40, '图记 instruction is not one short line')

// --- C. 图记 extraction, 40-char cap, streaming hide
const ex = api.extractImageMemo('哇这只好胖\n[图记：一只灰色玄凤在啃纸巾]')
ok(ex.text === '哇这只好胖' && ex.memo === '一只灰色玄凤在啃纸巾', '图记 extraction failed: ' + JSON.stringify(ex))
ok(Array.from(api.extractImageMemo('好[图记:' + '长'.repeat(100) + ']').memo).length === 40, '图记 not capped at 40 chars')
ok(api.stripImageMemoTags('好看[图记:一只', true) === '好看', 'half-written 图记 visible while streaming')

// --- D. regenerate of the same turn still sends the image; memo prompt not repeated once memo saved
const photo = withImage[withImage.length - 1]
photo.content[1].memo = '黄脸玄凤站在她手指上'
ctx.messages = withImage
;({ wire } = request())
ok(pixels(wire) === 1, '重新生成 of the image turn no longer sends the image')
ok(!JSON.stringify(wire).includes(api.imageMemoPrompt()), '图记 instruction repeated after memo was saved')

// --- E. next ordinary turn: archived to the 图记 line, no pixels, no instruction
const conv = [...withImage, { id: 'r1', role: 'assistant', content: '好可爱' }, { id: 'u2', role: 'user', content: '晚饭吃什么好' }]
ctx.messages = conv
let r = request()
ok(pixels(r.wire) === 0 && !JSON.stringify(r.wire).includes('base64'), 'image re-sent on an ordinary next turn')
ok(JSON.stringify(r.wire).includes('【此前发过的图片：黄脸玄凤站在她手指上】'), 'archived image lost its 图记 line')
ok(!JSON.stringify(r.wire).includes(api.imageMemoPrompt()), '图记 instruction leaked into a non-image turn')
ok(!r.w.imageReserveTokens, 'archived image still reserves image tokens')
// multi-bubble image turn: image + a text bubble right after it are one turn → still live
ctx.messages = [...withImage, { id: 'n2', role: 'user', content: '你看它' }]
ok(pixels(request().wire) === 1, 'image dropped when she adds a text bubble in the same turn')

// --- F. recall: explicit phrase → exactly one (most recent) original, then archived again
const older = { id: 'old', role: 'user', content: [img({ memo: '一碗番茄牛腩面', dataUrl: 'data:image/jpeg;base64,OLD' })] }
const recallConv = [...base(), older, { id: 'or', role: 'assistant', content: '好香' },
  ...withImage.slice(-1), { id: 'r1', role: 'assistant', content: '好可爱' },
  { id: 'u3', role: 'user', content: '你再看看刚才那张图，它脚上是不是有东西' }]
ctx.messages = recallConv
r = request()
ok(pixels(r.wire) === 1, 'recall phrase did not re-attach exactly one image')
ok(JSON.stringify(r.wire[r.wire.length - 1]).includes(bigBase64.slice(0, 40)) && !JSON.stringify(r.wire).includes('base64,OLD'),
  'recall did not pick the most recent image or attached it to the wrong turn')
ok(typeof recallConv[recallConv.length - 1].content === 'string',
  'recall modified the stored message')
ok(!JSON.stringify(r.wire).includes(api.imageMemoPrompt()), 'recall turn asked for a new 图记')
// recall by naming something in a stored 图记 → that (older) image, still max 1
ctx.messages = [...recallConv.slice(0, -1), { id: 'u4', role: 'user', content: '番茄牛腩面那家店叫什么来着' }]
r = request()
ok(pixels(r.wire) === 1 && JSON.stringify(r.wire).includes('base64,OLD'), '图记 keyword did not recall that one image')
// next turn after the recall → archived again
ctx.messages = [...recallConv, { id: 'r3', role: 'assistant', content: '有个脚环' }, { id: 'u5', role: 'user', content: '好的睡啦' }]
r = request()
ok(pixels(r.wire) === 0, 'recalled image kept hanging on the next turn')

// --- G. nothing accumulates: many archived images cost one short line each
const many = base()
for (let i = 0; i < 12; i++) many.splice(10 + i * 3, 0, { id: 'p' + i, role: 'user', content: [img({ memo: '图' + i + '：' + '很长的描述'.repeat(20) })] })
many.push({ id: 'end', role: 'user', content: '在吗' })
ctx.messages = many
r = request()
const lines = JSON.stringify(r.wire).match(/【此前发过的图片：[^】]*】/g) || []
ok(lines.length > 0 && lines.every(l => Array.from(l).length <= 40 + 11), 'archived image line exceeds the 图记 cap')
ok(pixels(r.wire) === 0 && !r.w.imageReserveTokens, 'archived images accumulate pixels or reserve')
ok(api.pastImagePromptText({ type: 'image', dataUrl: 'x' }) === '【此前发过的图片】', 'fallback archived line changed')

console.log(`image context regression: ${checks} checks passed`)
