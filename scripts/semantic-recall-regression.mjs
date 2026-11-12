import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

// v355 语义召回：切片、哈希去重、批量/退避、合并打分、阈值、超时回退、关闭时不调用。
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
ok(sw.includes('const CACHE = "role-chat-cache-v365";'), 'service worker cache was not bumped to v355')
ok(html.includes('🧭 语义召回') && html.includes('id="semantic-enabled"') && html.includes('id="semantic-provider"')
  && html.includes('id="semantic-model"') && html.includes('id="semantic-test"') && html.includes('id="semantic-rebuild"')
  && html.includes('id="semantic-progress"'), 'settings → 记忆库 has no 🧭 语义召回 card')
ok(html.includes('semanticRecallEnabled: false,'), 'semantic recall must default to off')
ok(html.includes('semanticRecallModel: "BAAI/bge-m3"'), 'default embedding model must be BAAI/bge-m3')
ok(/"semanticRecallEnabled","semanticRecallProviderId","semanticRecallModel"/.test(html), 'semantic settings are not synced')
ok(!/semanticRecall(?:Api)?Key/.test(html), 'semantic recall must reuse the provider key, not store its own')
ok(html.includes('if (typeof semanticRecallActive === "function" && semanticRecallActive()) await prepareSemanticRecall(historyWindow);'),
  'streamChat does not prepare semantic recall before memory assembly')
ok(html.includes('mergeSemanticRecallHits(hits, "cross"') && html.includes('mergeSemanticRecallHits(hits, "current"'),
  'semantic hits are not merged into keyword recall')
ok(html.includes('const semanticBlock = typeof semanticRecallBlock === "function" ? semanticRecallBlock() : null;'),
  'semantic lane is not part of 本轮记忆检查')
ok(html.includes('scheduleSemanticIndex(SEMANTIC_STARTUP_DELAY_MS)') && html.includes('scheduleSemanticIndex(SEMANTIC_AFTER_REPLY_DELAY_MS)'),
  'background index is not scheduled at startup and after replies')
ok(html.includes('renderSemanticRecallCard();'), 'semantic card is not rendered with settings')
ok(!html.slice(html.indexOf('// ---------- 语义召回'), html.indexOf('// ---------- /语义召回')).includes('localStorage'),
  'vectors must not touch localStorage')

const section = slice('// ---------- 语义召回 (semantic recall, v355) ----------', '// ---------- /语义召回 ----------')
ok(/const SEMANTIC_RECALL_THRESHOLD = 0\.55;/.test(section), 'threshold constant must be 0.55')
ok(/const SEMANTIC_STARTUP_DELAY_MS = 60 \* 1000;/.test(section) && /const SEMANTIC_BATCH_SIZE = 32;/.test(section)
  && /const SEMANTIC_BACKOFF_MS = 30 \* 60 \* 1000;/.test(section) && /const SEMANTIC_QUERY_TIMEOUT_MS = 4000;/.test(section),
  'scheduling constants changed')

// ---- mock IndexedDB ----
function makeIndexedDB() {
  const stores = new Map()
  const later = fn => setImmediate(fn)
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore: name => { stores.set(name, new Map()) },
    transaction(name) {
      const data = stores.get(name)
      const tx = { oncomplete: null, onerror: null, onabort: null }
      tx.objectStore = () => ({
        put: (value, key) => { data.set(key, value) },
        clear: () => { data.clear() },
        getAll: () => { const req = {}; later(() => { req.result = [...data.values()]; req.onsuccess?.() }); return req },
      })
      later(() => tx.oncomplete?.())
      return tx
    },
  }
  return {
    stores,
    open() {
      const req = { result: db }
      later(() => { req.onupgradeneeded?.(); req.onsuccess?.() })
      return req
    },
  }
}

// ---- mock embeddings: concept axes so meaning matches without shared words ----
const DIM = 16
const AXES = [/鹦鹉|小鸡|玄凤|鸟|羽毛|掉毛/, /键盘|电脑|代码|端口/, /茶|喝水/, /唱歌|嗓子/]
function embedText(text) {
  const v = new Array(DIM).fill(0)
  AXES.forEach((re, i) => { if (re.test(text)) v[i] = 1 })
  let h = 7
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  v[8 + (h % 8)] += 0.35 // small text-specific noise
  return v
}
const calls = []
let fetchMode = 'ok'
async function fetchMock(url, init) {
  const body = JSON.parse(init.body)
  calls.push({ url, body, auth: init.headers.authorization })
  if (fetchMode === 'hang') return new Promise(() => {})
  if (fetchMode === 'fail') return { ok: false, status: 429, text: async () => 'rate limited' }
  return { ok: true, json: async () => ({ data: body.input.map((t, index) => ({ index, embedding: embedText(t) })) }) }
}

// ---- context ----
const DAY = 86400000
const now = Date.now()
const oldTs = now - 10 * DAY
const long = (s, n) => (s + '。').repeat(Math.ceil(n / (s.length + 1))).slice(0, n)
const mkMsgs = (prefix, rows) => rows.map((r, i) => ({ id: `${prefix}${i}`, role: r[0], content: r[1], ts: r[2] }))
const pastWindow = { id: 'past', roleId: 'gu', title: '上周', messages: mkMsgs('p', [
  ['user', '我家小鸡今天又掉毛了，地上全是羽毛，我有点担心是不是生病了', oldTs],
  ['assistant', long('别担心，换季掉毛很正常，多给它们补点营养', 150), oldTs + 1000],
  ['user', long('嗯我明天去买点蛋黄粉给它们拌着吃', 150), oldTs + 2000],
  ['assistant', '好，记得少放一点。', oldTs + 3000],
  ['user', long('今天写了一下午代码，键盘都快敲坏了', 200), oldTs + DAY],
  ['assistant', long('辛苦了，起来活动一下肩膀', 200), oldTs + DAY + 1000],
  ['user', '天气好冷', oldTs + 2 * DAY],
]) }
pastWindow.messages[1]._compactedBy = 'sum-1' // archived originals are still indexed
pastWindow.messages.splice(4, 0, { id: 'evt', role: 'user', content: '[事件] 切换主题', _event: true, ts: oldTs + 5000 })
const rpWindow = { id: 'rp', roleId: 'gu', space: 'roleplay', title: '剧场', messages: mkMsgs('r', [
  ['user', '戏里小鸡变成了凤凰', oldTs], ['assistant', '凤凰展开羽毛', oldTs + 1000],
]) }
const current = { id: 'cur', roleId: 'gu', title: '现在', messages: mkMsgs('c', [
  ['user', '早', now - 5000], ['assistant', '早呀', now - 4000],
  ['user', '你说那几只鸟最近还好吗', now],
]) }
const memEntries = [
  { id: 'm1', text: '惟惟养了九只玄凤鹦鹉', status: 'active' },
  { id: 'm2', text: '惟惟每天喝茶', status: 'active' },
  { id: 'm3', text: '不注入的条目', status: 'active', autoInject: false },
]
const people = [{ id: 'b', name: '伯恩', events: [{ id: 'e1', date: '2026-11-01', text: '帮她修好了键盘' }] }]
const settings = {
  activeRoleId: 'gu', aiName: '顾祁砚', historyRecallScope: 'role',
  providers: [{ id: 'chat', name: '主渠道', provider: 'openai', baseUrl: 'https://relay.example/v1', apiKey: 'k1' },
    { id: 'sf', name: '硅基流动', provider: 'openai', baseUrl: 'https://api.siliconflow.cn/v1/', apiKey: 'sk-sf' }],
  semanticRecallEnabled: false, semanticRecallProviderId: '', semanticRecallModel: 'BAAI/bge-m3',
}
let convs = [current, pastWindow, rpWindow]
let currentRef = current
const idb = makeIndexedDB()
const context = {
  settings, DEFAULTS: { openai: { baseUrl: 'https://api.openai.com/v1' } },
  messages: current.messages,
  currentConv: () => currentRef,
  isRoleplayConversation: () => currentRef.space === 'roleplay',
  historyRecallConversations: () => convs.filter(c => c.roleId === settings.activeRoleId),
  isChatContentMessage: m => !!m && ['user', 'assistant'].includes(m.role),
  messageText: m => (typeof m?.content === 'string' ? m.content : ''),
  clipUnicodeChars: (s, n) => Array.from(String(s)).slice(0, n).join(''),
  activeMemoryEntries: () => memEntries.filter(e => e.status === 'active'),
  peopleList: () => people,
  historyRecallTokens: q => /^(?:好[的呀啊吧]?|嗯+|哦+)[～~!！。\s]*$/.test(q) ? new Set() : new Set([q]),
  recallQuoteDate: ts => { const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日` },
  fetch: fetchMock, indexedDB: idb, AbortController,
  setTimeout: (fn, ms) => setTimeout(fn, ms === 4000 ? 200 : Math.min(ms, 20)), clearTimeout,
  saveSettings() {}, showToast() {}, confirm: () => true, $: () => null,
  Date, Math, Promise, Map, Set, WeakMap, Int8Array, Float32Array, Array, JSON, Number, String, console: { ...console, warn() {} },
}
vm.createContext(context)
vm.runInContext(`${section}
globalThis.S = { semanticConversationChunks, allSemanticChunks, semanticHash, semanticQuantize, semanticCosine, semanticNormalize,
  runSemanticIndexBuild, scheduleSemanticIndex, prepareSemanticRecall, mergeSemanticRecallHits, semanticRecallBlock,
  semanticRecallActive, semanticRecallReady, semanticRecallPoints,
  get state() { return semanticRecallState }, get stats() { return semanticStats },
  get backoff() { return semanticBackoffUntil }, set backoff(v) { semanticBackoffUntil = v },
  get lastError() { return semanticLastError }, set lastError(v) { semanticLastError = v },
  set pausedUntil(v) { semanticQueryPausedUntil = v },
  THRESHOLD: SEMANTIC_RECALL_THRESHOLD, TOP_K: SEMANTIC_RECALL_TOP_K };`, context)
const S = context.S

// ---- off: nothing is called ----
ok(!S.semanticRecallReady() && !S.semanticRecallActive(), 'disabled semantic recall reported active')
ok(S.scheduleSemanticIndex(0) === false, 'build scheduled while disabled')
ok(await S.runSemanticIndexBuild() === false, 'build ran while disabled')
ok(await S.prepareSemanticRecall({ messages: [] }) === null && S.state === null, 'query prepared while disabled')
ok(S.semanticRecallBlock() === null, 'disabled semantic recall must add no memory lane')
settings.semanticRecallEnabled = true // enabled but no provider chosen → still off
ok(!S.semanticRecallReady() && await S.prepareSemanticRecall({ messages: [] }) === null, 'enabled without a provider must stay off')
const merged = S.mergeSemanticRecallHits([{ m: pastWindow.messages[0], s: 2 }], 'cross', {})
ok(merged.length === 1 && merged[0].s === 2, 'merge changed keyword hits while semantic recall is off')
ok(calls.length === 0, 'fetch was called while semantic recall was off')
settings.semanticRecallProviderId = 'sf'
ok(S.semanticRecallReady() && S.semanticRecallActive(), 'semantic recall should be active with a provider + key')

// ---- chunking ----
const chunks = S.semanticConversationChunks(pastWindow)
ok(chunks.length === 4, `expected 4 chunks from the past window, got ${chunks.length}`)
ok(chunks.every(c => c.msgs.length >= 1 && c.msgs.length <= 4), 'chunk exceeded 4 messages')
ok(chunks[0].msgs.length >= 2 && chunks[0].text.length >= 300 && chunks[0].text.length <= 720, 'first chunk is not a 2–4 message ~300–600 char window')
ok(chunks[0].text.includes('羽毛') && chunks[0].text.includes('蛋黄粉'), 'archived (_compactedBy) originals are missing from chunks')
ok(!chunks.some(c => c.text.includes('[事件]')), 'event messages leaked into chunks')
ok(chunks[0].firstId === 'p0' && chunks[0].anchor.id === 'p0' && chunks[0].convId === 'past', 'chunk lacks conversation/message id range')
ok(/^\d{4}-\d{2}-\d{2}\n/.test(chunks[0].text), 'chunk text is not dated')
ok(new Set(chunks.map(c => c.day)).size === 3, 'chunks crossed a day boundary')
ok(chunks[3].text.includes('天气好冷') && chunks[3].msgs.length === 1, 'an old open tail should be indexed')
ok(!S.semanticConversationChunks(current).length, 'a fresh still-growing tail must not be embedded yet')
ok(S.semanticConversationChunks(pastWindow) === chunks, 'chunk cache not reused when unchanged')
const all = S.allSemanticChunks()
ok(!all.some(c => c.conv === rpWindow), 'roleplay transcripts must not be indexed')
ok(all.some(c => c.kind === 'memory' && c.body === '惟惟养了九只玄凤鹦鹉') && !all.some(c => c.body === '不注入的条目'), 'memory entries are not one chunk each')
ok(all.some(c => c.kind === 'person' && c.text.includes('伯恩') && c.text.includes('修好了键盘')), 'people events are not one chunk each')

// ---- vector math ----
const qz = S.semanticQuantize([3, 4, 0, 0])
ok(qz.q instanceof Int8Array && Math.abs(S.semanticCosine(S.semanticNormalize([3, 4, 0, 0]), qz) - 1) < 0.02, 'int8 quantised cosine is off')
ok(S.semanticHash('abc') === S.semanticHash('abc') && S.semanticHash('abc') !== S.semanticHash('abd'), 'content hash is unstable')

// ---- incremental build + hash dedupe ----
ok(await S.runSemanticIndexBuild() === true, 'index build failed')
const store = idb.stores.get('vectors')
const firstCalls = calls.length
ok(firstCalls === 1, `expected one batch request, got ${firstCalls}`)
ok(calls[0].url === 'https://api.siliconflow.cn/v1/embeddings' && calls[0].auth === 'Bearer sk-sf', 'embedding request does not reuse the provider baseUrl/key')
ok(calls[0].body.model === 'BAAI/bge-m3' && Array.isArray(calls[0].body.input), 'embedding body must be {model, input:[…]}')
ok(store.size === all.length && [...store.values()].every(r => r.q instanceof Int8Array && r.k.startsWith('BAAI/bge-m3|')), 'vectors not stored as compressed arrays keyed by model|hash')
ok(S.stats.indexed === S.stats.total && S.stats.total === all.length, 'progress counts are wrong')
await S.runSemanticIndexBuild()
ok(calls.length === firstCalls, 'unchanged content was embedded again')
pastWindow.messages.push({ id: 'p9', role: 'user', content: '对了上周那只最胖的小鸡又重了', ts: oldTs + 3 * DAY })
await S.runSemanticIndexBuild()
ok(calls.length === firstCalls + 1 && calls[calls.length - 1].body.input.length === 1, 'only the changed chunk should be embedded')
const twin = { id: 'twin', roleId: 'gu', title: '复制', messages: pastWindow.messages.slice(0, 4).map(m => ({ ...m, id: 't' + m.id })) }
convs.push(twin)
await S.runSemanticIndexBuild()
ok(calls.length === firstCalls + 1, 'identical content in another window should reuse the same vector')

// ---- batches of 32 ----
const bulk = { id: 'bulk', roleId: 'gu', title: '很多', messages: [] }
for (let i = 0; i < 40; i++) bulk.messages.push({ id: 'b' + i, role: 'user', content: long(`第${i}段闲聊内容`, 700), ts: oldTs + i * 60000 })
convs.push(bulk)
const beforeBulk = calls.length
await S.runSemanticIndexBuild()
const bulkCalls = calls.slice(beforeBulk)
ok(bulkCalls.length === 2 && bulkCalls[0].body.input.length === 32 && bulkCalls[1].body.input.length === 8, 'batches must be at most 32 inputs')

// ---- 429 failure → 1 minute backoff (v356) ----
bulk.messages.push({ id: 'bx', role: 'user', content: long('新的一段需要嵌入', 320), ts: oldTs })
fetchMode = 'fail'
ok(await S.runSemanticIndexBuild() === false && S.backoff - Date.now() > 50000 && S.backoff - Date.now() < 70000 && /429/.test(S.lastError), 'rate-limited build should back off about 1 minute (v356)')
const afterFail = calls.length
ok(await S.runSemanticIndexBuild() === false && calls.length === afterFail, 'build retried during backoff')
fetchMode = 'ok'; S.backoff = 0; S.lastError = ''
convs = convs.filter(c => c !== bulk)

// ---- recall: threshold, top-k, merge ----
const historyWindow = { messages: current.messages.slice() }
const state = await S.prepareSemanticRecall(historyWindow)
ok(state.status === 'ok' && state.hits.length > 0 && state.hits.length <= S.TOP_K, 'semantic recall found nothing')
ok(S.THRESHOLD === 0.55 && state.hits.every(h => h.sim >= S.THRESHOLD), 'a hit below the threshold was used')
ok(state.hits.every((h, i, a) => !i || a[i - 1].sim >= h.sim), 'hits are not sorted by similarity')
ok(state.hits.some(h => h.chunk.kind === 'chat' && h.chunk.text.includes('掉毛')), 'meaning match (鸟 ↔ 小鸡掉毛) was not recalled')
ok(!state.hits.some(h => h.chunk.text.includes('键盘')), 'unrelated chunk passed the threshold')
ok(state.hits.some(h => h.chunk.kind === 'memory' && h.chunk.body.includes('玄凤')), 'semantic memory entry not recalled')
const lastQuery = calls[calls.length - 1]
ok(lastQuery.body.input.length === 1 && lastQuery.body.input[0].includes('那几只鸟'), 'query vector must be one request built from her latest messages')

const birdChunk = state.hits.find(h => h.chunk.kind === 'chat' && h.chunk.conv === pastWindow && h.chunk.text.includes('掉毛')).chunk
const keywordHit = { key: 'cross:past:' + birdChunk.msgs[1].id, m: birdChunk.msgs[1], c: pastWindow, s: 2 }
const crossHits = S.mergeSemanticRecallHits([keywordHit], 'cross', {
  makeHit: (m, c, points, sim) => ({ key: 'cross:' + c.id + ':' + m.id, m, c, s: points }),
})
ok(keywordHit.s > 2 && keywordHit.semanticSim >= S.THRESHOLD, 'semantic score was not added to the keyword hit of the same chunk')
ok(crossHits.filter(h => birdChunk.msgs.includes(h.m)).length === 1, 'same chunk appeared twice after merging')
ok(crossHits.every(h => h.c !== current), 'cross scope merged the current window')
ok(S.semanticRecallPoints(0.55) === 3 && S.semanticRecallPoints(1) === 9 && S.semanticRecallPoints(0.775) === 6, 'semantic points formula changed')
const freshHits = S.mergeSemanticRecallHits([], 'cross', { makeHit: (m, c, points, sim) => ({ key: m.id, m, c, s: points }) })
ok(freshHits.some(h => h.semanticSim && h.m.role === 'user'), 'semantic-only chunk did not add its anchor (her message)')
const currentHits = S.mergeSemanticRecallHits([], 'current', { allowed: new Set(), makeHit: (m, c, s) => ({ m, c, s }) })
ok(currentHits.length === 0, 'current scope ignored the omitted/archived allow-list')

const block = S.semanticRecallBlock()
ok(block.key === 'semantic' && /^语义召回 · \d+ 段 · 最高相似度 [01]\.\d\d$/.test(block.label), `inspection label wrong: ${block.label}`)
ok(block.text.includes('- 惟惟养了九只玄凤鹦鹉') && !block.text.includes('键盘'), 'semantic memory lines missing from block')

// live window chunks are not recalled again
currentRef = pastWindow
const liveState = await S.prepareSemanticRecall({ messages: pastWindow.messages.slice() })
ok(!liveState.hits.some(h => h.chunk.conv === pastWindow && h.chunk.msgs.every(m => !m._compactedBy)), 'chunks already in the live window were recalled')
currentRef = current

// acknowledgements don't spend a request
const ackCalls = calls.length
current.messages.push({ id: 'c9', role: 'user', content: '好呀', ts: now + 1 })
ok(await S.prepareSemanticRecall(historyWindow) === null && calls.length === ackCalls, '“好呀” should not trigger a query embedding')
current.messages.pop()

// roleplay window: semantic recall stays off
currentRef = rpWindow
ok(!S.semanticRecallActive() && await S.prepareSemanticRecall({ messages: [] }) === null, 'semantic recall ran inside a roleplay window')
currentRef = current

// ---- timeout fallback ----
current.messages.push({ id: 'c10', role: 'user', content: '我想唱歌但嗓子哑了', ts: now + 2 })
fetchMode = 'hang'
const t0 = Date.now()
const timed = await S.prepareSemanticRecall(historyWindow)
ok(timed.status === 'timeout' && timed.hits.length === 0 && Date.now() - t0 < 2000, 'hanging query did not time out cleanly')
const untouched = [{ m: pastWindow.messages[0], s: 5 }]
S.mergeSemanticRecallHits(untouched, 'cross', { makeHit: () => ({ s: 99 }) })
ok(untouched.length === 1 && untouched[0].s === 5, 'keyword recall changed after a semantic timeout')
ok(/跳过（超时）/.test(S.semanticRecallBlock().label) && S.semanticRecallBlock().text === '', 'timeout not shown in 本轮记忆检查')
const pausedCalls = calls.length
const paused = await S.prepareSemanticRecall(historyWindow)
ok(paused.status === 'paused' && calls.length === pausedCalls, 'query should pause briefly after a timeout instead of waiting every turn')
S.pausedUntil = 0
fetchMode = 'ok'

// ---- turning it off again restores keyword-only behaviour ----
settings.semanticRecallEnabled = false
const offCalls = calls.length
ok(await S.prepareSemanticRecall(historyWindow) === null && S.semanticRecallBlock() === null && calls.length === offCalls, 'switching off did not stop semantic recall')

console.log(`semantic recall regression: ${checks} checks passed`)
