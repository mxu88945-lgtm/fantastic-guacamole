import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
let checks = 0

const ok = (value, message) => {
  if (!value) throw new Error(message)
  checks++
}

ok(html.includes('traces: [],\n    responseState: "submitted"'),
  'assistant messages do not initialize the trace state machine')
ok(html.includes('startMessageTrace(assistantMsg, act.type, "关键词：" + act.q)'),
  'internal tools are not recorded as trace phases')
ok(!html.includes('assistantMsg.content = "🔍 正在翻找以前的聊天'),
  'history-search progress still pollutes visible answer text')
ok(!html.includes('assistantMsg.content = "🌐 正在联网搜索'),
  'web-search progress still pollutes visible answer text')
ok(!html.includes('assistantMsg.content = "🖼️ 正在相册里翻找'),
  'album-search progress still pollutes visible answer text')
ok(html.includes('finishRunningTraces(assistantMsg, "error", "接口连接中断，可重新生成")'),
  'stream failures do not settle active trace phases')
ok(html.includes('tracePhasesForRender(traces, !!streaming)'),
  'stale running phases are not normalized when history is restored')
ok(html.includes('msg.traces = cloneChatData(baseMsg.traces)'),
  'multi-bubble replies do not preserve their trace history')
ok(sw.includes('const CACHE = "role-chat-cache-v156";'),
  'service worker cache was not bumped to v156')

const start = html.indexOf('const TRACE_COPY = {')
const end = html.indexOf('function stickerImg(', start)
ok(start >= 0 && end > start, 'trace helper section was not found')

let id = 0
const context = {
  uid: () => `trace-${++id}`,
  escapeHtml: (value) => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}
vm.runInNewContext(
  `${html.slice(start, end)}
   globalThis.traceApi = { startMessageTrace, finishMessageTrace, finishRunningTraces,
     tracePhasesForRender, thinkBlockHtml };`,
  context,
)

const message = { traces: [] }
const thinking = context.traceApi.startMessageTrace(message, 'thinking', '')
ok(thinking.status === 'running' && thinking.label === '正在整理回复',
  'thinking phase did not enter the running state')

const tool = context.traceApi.startMessageTrace(message, 'web', '关键词：天气')
ok(thinking.status === 'completed' && tool.status === 'running',
  'starting a tool did not complete the preceding thought phase')
context.traceApi.finishMessageTrace(message, tool.id, 'completed')
ok(tool.label === '查找了网页资料' && Number.isFinite(tool.endedAt),
  'completed tool phase did not keep its completion metadata')

const stale = context.traceApi.tracePhasesForRender([
  { id: 'old', type: 'album', status: 'running', label: '正在查看私人相册' },
], false)
ok(stale[0].status === 'stopped' && stale[0].label === '已停止检索相册',
  'a stale phase still renders as indefinitely running')

const rendered = context.traceApi.thinkBlockHtml(
  'private reasoning', false, message.traces, 'complete', false,
)
ok(rendered.includes('process-trace') && rendered.includes('查找了网页资料')
  && rendered.includes('private reasoning'),
  'unified trace row does not render tool phases and reasoning together')

console.log(`thought trace regression: ${checks} checks passed`)
