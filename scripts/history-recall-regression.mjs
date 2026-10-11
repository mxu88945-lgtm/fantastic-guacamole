import fs from 'node:fs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

const ok = (condition, message) => { if (!condition) throw new Error(message) }

ok(html.includes('const expandedSummaryIds = new Set()'),
  'archived-source expansion state is missing')
ok(html.includes('archivedMessagesForSummary(conv, summary).forEach'),
  'archived raw messages are not kept visible after background compaction')
ok(html.includes('m._summary && !expandedSummaryIds.has(m.id)') && html.includes('已在后台整理进连续性档案'),
  'continuity summary is not collapsed into a background divider')
ok(!html.includes('"展开 " + archived.length + " 条旧原文"'),
  'chat view still hides originals behind an expand control')
ok(html.includes('(?:今天|今早|早上|上午|中午|午饭|下午|傍晚|晚上|今晚|昨晚)'),
  'time-based recall intent is not recognized')
ok(html.includes('function recallTimeScore(queryText, timestamp)'),
  'recall ranking does not use message timestamps')
ok(html.includes('function recallIntentAffinity(queryText, candidateText)'),
  'short food logs have no intent-affinity score')
ok(html.includes('lexical + temporal + affinity'),
  'recall scores do not combine keywords, time and intent')
ok(html.includes('必须先搜索，不能直接说记录不存在'),
  'the model is not told to search before denying a concrete report exists')
ok(!html.includes('indexedDB.deleteDatabase'),
  'update path must not delete the canonical conversation database')
ok(sw.includes('const CACHE = "role-chat-cache-v189";'),
  'service worker cache was not bumped for history recall fixes')

console.log('history recall regression: 11 checks passed')
