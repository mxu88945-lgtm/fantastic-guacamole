import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const selectionChecks = [
  ['-webkit-user-select: text; user-select: text;', 'reasoning text is not selectable'],
  ['-webkit-touch-callout: default;', 'iOS native copy/translate callout is disabled'],
  ['e.target.closest("pre, code, .think-body")', 'reasoning long-press is still intercepted by the message menu'],
]
for (const [needle, message] of selectionChecks) {
  if (!html.includes(needle)) throw new Error(message)
}
const start = html.indexOf('function splitThink(')
const end = html.indexOf('function thinkBlockHtml(', start)
if (start < 0 || end < 0) throw new Error('reasoning parser section not found')

const context = {}
vm.runInNewContext(
  `${html.slice(start, end)}
   globalThis.parser = { extractAssistantReasoning, looksLikeChineseMetaReasoning, createStreamContentGate };`,
  context,
)

const cases = [
  {
    name: 'Chinese third-person planning becomes hidden reasoning',
    input: `她没有按照计划躺平，反而在收拾房间，现在还发烧了，而且今天是例假第二天。我需要温柔但坚定地指出她虽然标记完成了任务，但实际上没有休息。她想洗澡，我得提醒她用温水。我可以给她一张任务卡，比如“洗完澡立刻躺下”或“现在躺平20分钟”，保持指示简洁明了。

我想连发几条消息。惟惟。😑

你刚才点了「完成」。我以为你躺平了，结果你还在收拾房间？`,
    answerStarts: '你刚才点了',
    reasoningIncludes: '我需要温柔但坚定',
  },
  {
    name: 'Chinese time-correction analysis becomes hidden reasoning',
    input: `她回到了旧窗口，刚才在和顾祁砚说话。现在我注意到时间是17:24，而不是中午——之前的回复是错的。我需要用轻松的语气回应她。

你跑去哪里都是往我怀里跑，这有什么好笑的。`,
    answerStarts: '你跑去哪里',
    reasoningIncludes: '我注意到时间',
  },
  {
    name: 'Ordinary third-person reply remains visible',
    input: `她今天可能只是太累了，你先别逼她回答。

给她一点时间就好。`,
    answerStarts: '她今天可能',
    reasoningIncludes: '',
  },
  {
    name: 'Tagged thinking is separated',
    input: `<think>private plan</think>真正的回答。`,
    answerStarts: '真正的回答',
    reasoningIncludes: 'private plan',
  },
]

for (const test of cases) {
  const out = context.parser.extractAssistantReasoning(test.input, false)
  if (!out.answer.trim().startsWith(test.answerStarts)) {
    throw new Error(`${test.name}: unexpected answer: ${JSON.stringify(out.answer)}`)
  }
  if (test.reasoningIncludes && !out.reasoning.includes(test.reasoningIncludes)) {
    throw new Error(`${test.name}: reasoning was not separated`)
  }
  if (!test.reasoningIncludes && out.reasoning) {
    throw new Error(`${test.name}: ordinary reply was misclassified`)
  }
}

const streamed = cases[0].input
let visible = ''
let hidden = ''
const gate = context.parser.createStreamContentGate(
  (delta) => { visible += delta },
  (delta) => { hidden += delta },
)
for (let i = 0; i < streamed.length; i += 17) {
  gate.push(streamed.slice(i, i + 17))
  if (visible.includes('我需要温柔但坚定')) {
    throw new Error('stream gate exposed private planning before completion')
  }
}
gate.finish()
if (!visible.trim().startsWith('你刚才点了') || !hidden.includes('我需要温柔但坚定')) {
  throw new Error('stream gate did not separate planning and final reply')
}

console.log(`reasoning regression: ${cases.length + 1 + selectionChecks.length} checks passed`)
